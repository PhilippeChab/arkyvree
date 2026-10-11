import { sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";

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
