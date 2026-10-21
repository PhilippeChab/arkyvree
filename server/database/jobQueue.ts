import { sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";

import { db } from "./connection.ts";

/** Queues a job for the worker (graphile-worker), in `db`'s transaction when it's one. Ping the worker once it commits. */
export async function addJob(
  db: Db,
  task: string,
  payload: unknown,
  options: { jobKey?: string; maxAttempts: number; queueName?: string },
) {
  await db.execute(
    sql`SELECT graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      max_attempts := ${options.maxAttempts},
      queue_name := ${options.queueName ?? null},
      job_key := ${options.jobKey ?? null}
    )`,
  );
}

/**
 * How many jobs keyed `jobKey` (`addJob`'s `jobKey`) are still to run: queued, running (its attempt counted as it's
 * taken), or failed with an attempt left. The worker deletes a job it finishes, and keeps one it gives up on with none
 * left.
 */
export async function countJobsToRun(jobKey: string) {
  const jobs = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM graphile_worker.jobs
    WHERE key = ${jobKey} AND (attempts < max_attempts OR locked_at IS NOT NULL)
  `);
  return jobs.rows[0]?.count ?? 0;
}
