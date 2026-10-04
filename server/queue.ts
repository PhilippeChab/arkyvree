import { sql } from "drizzle-orm";

import type { Db } from "@/server/database/index.ts";
import { readEnv } from "@/server/environment.ts";

/** Queues a job for the worker (graphile-worker), in `db`'s transaction when it's one. Ping the worker once it commits. */
export async function addJob(
  db: Db,
  task: string,
  payload: unknown,
  options: { maxAttempts: number; queueName?: string },
) {
  await db.execute(
    sql`SELECT graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      max_attempts := ${options.maxAttempts},
      queue_name := ${options.queueName ?? null}
    )`,
  );
}

export const pingWorker = () => {
  const url = readEnv("WORKER_FLYCAST_URL");
  if (!url) return;
  fetch(url, { signal: AbortSignal.timeout(500) }).catch(() => {});
};
