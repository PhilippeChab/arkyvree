import { sql } from "drizzle-orm";
import type { JobHelpers } from "graphile-worker";

import { db } from "@/server/database/index.ts";

/** Worker job helpers with a silent logger, for running a task directly. */
export const silentJobHelpers = {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
} as unknown as JobHelpers;

/** The jobs queued whose payload's `key` is `value`: their task, queue and payload. */
export async function queuedJobs(key: string, value: string) {
  const jobs = await db.execute<{ task: string; queue: string | null; payload: Record<string, unknown> }>(sql`
    SELECT t.identifier AS task, q.queue_name AS queue, j.payload
    FROM graphile_worker._private_jobs j
    JOIN graphile_worker._private_tasks t ON t.id = j.task_id
    LEFT JOIN graphile_worker._private_job_queues q ON q.id = j.job_queue_id
    WHERE j.payload->>${key} = ${value}
  `);
  return jobs.rows;
}

/** The PDF jobs queued for `characterId`: task, queue and payload. */
export async function queuedPdfJobs(characterId: string) {
  return await queuedJobs("characterId", characterId);
}
