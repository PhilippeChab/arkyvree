/** The job runner's setup: its tasks and their schedule, its logger and events, and its database pool. */

import { EventEmitter } from "node:events";

import * as Sentry from "@sentry/bun";
import { Logger } from "graphile-worker";
import { Pool } from "pg";

import { readEnv } from "@/server/environment.ts";

import { generatePdfTask } from "./generatePdf.ts";
import { runCleanupTask } from "./runCleanup.ts";
import { sendEmailTask } from "./sendEmail.ts";
import { sweepPendingBlobsTask } from "./sweepPendingBlobs.ts";

/** The cleanup at 4 every morning, the blob sweep every hour. */
export const crontab = ["0 4 * * * runCleanup", "0 * * * * sweepPendingBlobs"].join("\n");

export const taskList = {
  generatePdf: generatePdfTask,
  sendEmail: sendEmailTask,
  runCleanup: runCleanupTask,
  sweepPendingBlobs: sweepPendingBlobsTask,
};

export const workerLogger = new Logger((scope) => (level, message) => {
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
});

/** The runner's events: a job's errors are logged, a permanent failure and a fatal error reported to Sentry. */
export function createWorkerEvents(onFatalError: () => void) {
  const events = new EventEmitter();

  events.on("job:error", ({ job, error }) => {
    console.error(
      `[worker] Job ${job.task_identifier} (id=${job.id}) error (attempt ${job.attempts}/${job.max_attempts}):`,
      error,
    );
  });

  events.on("job:failed", ({ job, error }) => {
    console.error(`[worker] Job ${job.task_identifier} (id=${job.id}) permanently failed:`, error);
    Sentry.captureException(error, {
      tags: { task: job.task_identifier },
      extra: { jobId: job.id, attempts: job.attempts, maxAttempts: job.max_attempts },
    });
  });

  const fatal = ({ error }: { error: unknown }) => {
    console.error("[worker] Fatal error:", error);
    Sentry.captureException(error, { level: "fatal" });
    onFatalError();
  };
  events.on("worker:fatalError", fatal);
  events.on("pool:fatalError", fatal);

  events.on("pool:listen:error", ({ error }) => {
    console.error("[worker] Listen connection error:", error);
    Sentry.captureException(error);
  });
  return events;
}

/**
 * The runner's own pool. Graphile-worker uses LISTEN/NOTIFY for instant job pickup. Neon's pooler (PgBouncer) doesn't
 * support session-level features, so we need a direct connection. Prefer DIRECT_DATABASE_URL, otherwise strip
 * `-pooler`.
 */
export function createWorkerPool() {
  const directUrl = (readEnv("DIRECT_DATABASE_URL") || readEnv("DATABASE_URL") || "").replace("-pooler", "");
  const pool = new Pool({
    connectionString: directUrl,
    max: parseInt(readEnv("WORKER_DB_POOL_MAX") || "5", 10),
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
  pool.on("error", (err) => {
    console.error("[worker] Pool client error:", err.message);
  });
  // Checked-out clients also need a listener while idle between queries.
  pool.on("connect", (client) => {
    client.on("error", (err) => {
      console.error("[worker] Active database client error:", err.message);
    });
  });
  return pool;
}
