import type { Task } from "graphile-worker";

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

type SweepResult = "swept" | "failed" | "skipped";

async function sweepOne(blobId: string, key: string, logger: Logger): Promise<SweepResult> {
  return await withTransaction(async (tx) => {
    if (!(await Blobs.lock(tx, { id: blobId }, "update", true))) return "skipped";

    const refs = await Attachments.findMany(tx, { blobIds: [blobId] });
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
    const candidates = await Blobs.findOrphans(
      db,
      { createdBefore: cutoff, excludeIds: [...failedIds] },
      { limit: batch },
    );

    if (candidates.length === 0) break;

    let sweptThisBatch = 0;
    for (const candidate of candidates) {
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
    if (candidates.length < batch) break;
  }

  if (swept > 0 || failed > 0) {
    logger.info(`Swept ${swept} blobs, ${failed} failed`);
  }
  return { swept, failed };
}

export const sweepPendingBlobsTask: Task = async (_, helpers) => {
  await sweepPendingBlobs({ logger: helpers.logger });
};
