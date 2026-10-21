import { sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";

import { db } from "./connection.ts";

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

/**
 * How many jobs of `task` whose payload's `key` is `value` are still to run: queued, running, or failed with an attempt
 * left. The worker deletes a job it finishes, and keeps one it gives up on with none left.
 */
export async function countJobsToRun(task: string, key: string, value: string) {
  const jobs = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM graphile_worker._private_jobs j
    JOIN graphile_worker._private_tasks t ON t.id = j.task_id
    WHERE t.identifier = ${task} AND j.payload->>${key} = ${value} AND j.attempts < j.max_attempts
  `);
  return jobs.rows[0]?.count ?? 0;
}
