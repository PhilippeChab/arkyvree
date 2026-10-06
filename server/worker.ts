import { run } from "graphile-worker";

import "@/server/instrument-worker.ts";
import "@/server/log.ts";
import { setCacheEnabled } from "@/server/cache/index.ts";
import { waitForDatabase } from "@/server/database/index.ts";
import { readEnv } from "@/server/environment.ts";
import { createWorkerEvents, createWorkerPool, crontab, taskList, workerLogger } from "@/server/jobs/runner.ts";
import { isShuttingDown, onShutdown } from "@/server/shutdown.ts";

async function main() {
  // Web mutations cannot invalidate this process’s in-memory cache. Each job
  // must build its sheet from current committed rules instead of a previous job.
  setCacheEnabled(false);

  await waitForDatabase();

  let workerHealthy = true;
  const workerPool = createWorkerPool();
  const runner = await run({
    pgPool: workerPool,
    concurrency: 2,
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
      const active = workerHealthy && !isShuttingDown();
      return new Response(active ? "ok" : "stopping", { status: active ? 200 : 503 });
    },
  });
  console.log(`[worker] Health check at http://${healthServer.hostname}:${healthServer.port}/health`);

  onShutdown("worker", async () => {
    await runner.stop();
    await workerPool.end();
    await healthServer.stop(true);
  });
}

await main();
