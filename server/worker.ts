import { run } from "graphile-worker";

import "./instrument-worker.ts";
import "./log.ts";
import { MemoryCache } from "./cache/index.ts";
import { waitForDatabase } from "./database/index.ts";
import { checkEmailSetup, findPendingEmailSetup } from "./emails/index.ts";
import { readEnv } from "./environment.ts";
import { createWorkerEvents, createWorkerPool, crontab, taskList, workerLogger } from "./jobs/runner.ts";
import Shutdown from "./Shutdown.ts";
import { checkStorageConfiguration } from "./storage/ObjectStorage.ts";

async function main() {
  checkStorageConfiguration("worker");
  // Web mutations cannot invalidate this process’s in-memory cache. Each job
  // must build its sheet from current committed rules instead of a previous job.
  MemoryCache.setEnabled(false);

  // A self-hosted install whose email isn't set up yet runs no jobs: the server's page says what to fix
  const pendingEmailSetup = findPendingEmailSetup();
  if (pendingEmailSetup) {
    console.warn(`[worker] ${pendingEmailSetup}`);
    console.warn("[worker] Email isn't set up: running no jobs until it is");
    // Stays up beside the server, which the image's entrypoint stops with it, until the container restarts
    const idle = setInterval(() => {}, 60 * 60 * 1000);
    Shutdown.onSignal("worker", async () => clearInterval(idle));
    return;
  }

  checkEmailSetup("worker");
  await waitForDatabase();

  let workerHealthy = true;
  const workerPool = createWorkerPool();
  const runner = await run({
    pgPool: workerPool,
    // One job at a time in the self-hosted image, where the worker shares the server's machine
    concurrency: Number(readEnv("WORKER_CONCURRENCY")) || 2,
    noHandleSignals: true,
    logger: workerLogger,
    events: createWorkerEvents(() => {
      workerHealthy = false;
    }),
    taskList,
    crontab,
  });
  console.log("[worker] Started");

  const healthServer = Bun.serve({
    port: Number(readEnv("WORKER_PORT")) || 8001,
    hostname: readEnv("HOST") || "0.0.0.0",
    fetch(req) {
      if (new URL(req.url).pathname !== "/health") return new Response("Not Found", { status: 404 });
      const active = workerHealthy && !Shutdown.isShuttingDown();
      return new Response(active ? "ok" : "stopping", { status: active ? 200 : 503 });
    },
  });
  console.log(`[worker] Health check at http://${healthServer.hostname}:${healthServer.port}/health`);

  Shutdown.onSignal("worker", async () => {
    await runner.stop();
    await workerPool.end();
    await healthServer.stop(true);
  });
}

await main();
