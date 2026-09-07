import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { attachmentsInStorage, blobsInStorage } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Attachments, Blobs } from "@/server/repositories/index.ts";
import { getStorage, isStorageConfigured } from "@/server/storage/s3.ts";
import { UNATTACHED_BLOB_TTL_MS } from "@/shared/attachments.ts";

const BATCH_SIZE = 500;

interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

const noopLogger: Logger = { info() {}, warn() {} };

export async function sweepPendingBlobs(
  opts: { ttlMs?: number; batchSize?: number; logger?: Logger; now?: Date } = {},
): Promise<{ swept: number; failed: number }> {
  const logger = opts.logger ?? noopLogger;

  if (!isStorageConfigured()) {
    logger.info("Storage not configured, skipping pending-blob sweep");
    return { swept: 0, failed: 0 };
  }

  const ttl = opts.ttlMs ?? UNATTACHED_BLOB_TTL_MS;
  const batch = opts.batchSize ?? BATCH_SIZE;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - ttl).toISOString();

  let swept = 0;
  let failed = 0;
  // Track ids that failed in this run so the next SELECT excludes them.
  // Without this, ORDER BY created_at ASC keeps re-surfacing the same
  // failing rows at the front of every batch and the loop achieves only
  // the success-count's worth of progress per iteration.
  const failedIds = new Set<string>();
  while (true) {
    const exclude = failedIds.size > 0
      ? sql`AND b.id NOT IN (${sql.join([...failedIds].map((id) => sql`${id}::uuid`), sql`, `)})`
      : sql``;
    const candidates = (await db.execute<{ id: string; key: string }>(sql`
      SELECT b.id, b.key
      FROM ${blobsInStorage} b
      WHERE NOT EXISTS (
        SELECT 1 FROM ${attachmentsInStorage} a WHERE a.blob_id = b.id
      )
        AND (
          b.attached_at IS NOT NULL
          OR (b.attached_at IS NULL AND b.created_at < ${cutoff})
        )
        ${exclude}
      ORDER BY b.created_at ASC
      LIMIT ${batch}
    `)) as unknown as { rows: Array<{ id: string; key: string }> };

    if (candidates.rows.length === 0) break;

    let sweptThisBatch = 0;
    for (const candidate of candidates.rows) {
      const result = await sweepOne(candidate.id, candidate.key, logger);
      if (result === "swept") {
        swept++;
        sweptThisBatch++;
      } else if (result === "failed") {
        failed++;
        failedIds.add(candidate.id);
      }
    }

    if (sweptThisBatch === 0) break;
    if (candidates.rows.length < batch) break;
  }

  if (swept > 0 || failed > 0) {
    logger.info(`Swept ${swept} blobs, ${failed} failed`);
  }
  return { swept, failed };
}

type SweepResult = "swept" | "failed" | "skipped";

async function sweepOne(blobId: string, key: string, logger: Logger): Promise<SweepResult> {
  return await withTransaction(async (tx) => {
    const lockedRows = (await tx.execute<{ id: string }>(sql`
      SELECT id FROM ${blobsInStorage} WHERE id = ${blobId} FOR UPDATE SKIP LOCKED
    `)) as unknown as { rows: Array<{ id: string }> };
    if (lockedRows.rows.length === 0) return "skipped";

    const refs = await Attachments.findManyByBlobIds(tx, { blobIds: [blobId] });
    if (refs.length > 0) return "skipped";

    // S3 call inside the tx (unlike attach() which moves it out) — the
    // FOR UPDATE lock has to span both the S3 delete and the row delete
    // so a concurrent attach() can't grab the blob and create a ref
    // after we've already deleted the S3 object. Sweep is sequential
    // (graphile-worker single concurrency) so connection-pool impact
    // is bounded.
    try {
      await getStorage().deleteObject(key);
      await Blobs.delete(tx, { id: blobId });
      return "swept";
    } catch (err) {
      logger.warn(`S3 delete failed for ${key}: ${err instanceof Error ? err.message : err}`);
      return "failed";
    }
  });
}

export const sweepPendingBlobsTask: Task = async (_, helpers) => {
  await sweepPendingBlobs({ logger: helpers.logger });
};
