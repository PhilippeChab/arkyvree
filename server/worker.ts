import { setCacheEnabled } from "@/server/cache/MemoryCache.ts";
import "@/server/instrument-worker.ts";
import "@/server/log.ts";
import { shutdownOtel } from "@/server/otel.ts";
import { Sentry } from "@/server/sentry.ts";

import { sql } from "drizzle-orm";
import { EventEmitter } from "events";
import { run, Logger, type Runner } from "graphile-worker";
import { Pool } from "pg";

import { db } from "@/server/database/index.ts";
import { runCleanupTask } from "@/server/jobs/runCleanup";
import { generatePdfTask } from "@/server/jobs/generatePdf.tsx";
import { sendEmailTask } from "@/server/jobs/sendEmail.ts";
import { sweepPendingBlobsTask } from "@/server/jobs/sweepPendingBlobs.ts";

const logger = new Logger((scope) => {
  return (level, message) => {
    const prefix = scope.label ? `[worker:${scope.label}]` : "[worker]";
    switch (level) {
      case "error":
        console.error(`${prefix} ${message}`);
        break;
      case "warning":
        console.warn(`${prefix} ${message}`);
        break;
      case "debug":
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  };
});

const events = new EventEmitter();

events.on("job:error", ({ job, error }) => {
  console.error(`[worker] Job ${job.task_identifier} (id=${job.id}) error (attempt ${job.attempts}/${job.max_attempts}):`, error);
});

events.on("job:failed", ({ job, error }) => {
  console.error(`[worker] Job ${job.task_identifier} (id=${job.id}) permanently failed:`, error);
  Sentry.captureException(error, {
    tags: { task: job.task_identifier },
    extra: { jobId: job.id, attempts: job.attempts, maxAttempts: job.max_attempts },
  });
});

let workerHealthy = true;
const onFatalError = ({ error }: { error: unknown }) => {
  console.error("[worker] Fatal error:", error);
  Sentry.captureException(error, { level: "fatal" });
  workerHealthy = false;
};
events.on("worker:fatalError", onFatalError);
events.on("pool:fatalError", onFatalError);

events.on("pool:listen:error", ({ error }) => {
  console.error("[worker] Listen connection error:", error);
  Sentry.captureException(error);
});

const warmUp = async (attempts = 4, delayMs = 500) => {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.execute(sql`SELECT 1`);
      console.log("[db] Connection pool warmed up");
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db] Warm-up attempt ${i}/${attempts} failed: ${msg}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  console.error("[db] Unreachable after all retries — exiting");
  process.exit(1);
};

// Web mutations cannot invalidate this process’s in-memory cache. Each job
// must build its sheet from current committed rules instead of a previous job.
setCacheEnabled(false);

await warmUp();

// Graphile-worker uses LISTEN/NOTIFY for instant job pickup. Neon's pooler
// (PgBouncer) doesn't support session-level features, so we need a direct
// connection. Prefer DIRECT_DATABASE_URL, otherwise strip `-pooler`.
const directUrl = (process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "").replace("-pooler", "");
const workerPool = new Pool({
  connectionString: directUrl,
  max: parseInt(process.env.WORKER_DB_POOL_MAX || "5", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // TCP keepalive detects dead sockets (e.g. after a Fly suspend/resume cycle
  // where Neon has already torn down the server end). Without this, the pool
  // holds onto half-open connections and polls hang forever.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
});
workerPool.on("error", (err) => {
  console.error("[worker] Pool client error:", err.message);
});
// Checked-out clients also need a listener while idle between queries.
workerPool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error("[worker] Active database client error:", err.message);
  });
});

const runner: Runner = await run({
  pgPool: workerPool,
  concurrency: 2,
  noHandleSignals: true,
  logger,
  events,
  taskList: {
    generatePdf: generatePdfTask,
    sendEmail: sendEmailTask,
    runCleanup: runCleanupTask,
    sweepPendingBlobs: sweepPendingBlobsTask,
  },
  crontab: [
    "0 4 * * * runCleanup",
    "0 * * * * sweepPendingBlobs",
  ].join("\n"),
});

console.log("[worker] Started");

let shuttingDown = false;

const healthPort = Number(process.env.WORKER_PORT) || 8001;
const healthServer = Bun.serve({
  port: healthPort,
  hostname: process.env.HOST || "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      const active = workerHealthy && !shuttingDown;
      return new Response(active ? "ok" : "stopping", { status: active ? 200 : 503 });
    }
    return new Response("Not Found", { status: 404 });
  },
});
console.log(`[worker] Health check at http://${healthServer.hostname}:${healthServer.port}/health`);

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[worker] Shutting down...");
  setTimeout(() => process.exit(0), 30_000);
  await runner.stop();
  await workerPool.end();
  await healthServer.stop(true);
  await shutdownOtel();
  console.log("[worker] Stopped");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
