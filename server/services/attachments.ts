import { type Db, db } from "@/server/database/index.ts";
import { Attachments } from "@/server/repositories/index.ts";
import { getStorage } from "@/server/storage/s3.ts";

// 5-minute cooldown so a credentials rotation that breaks getStorage()
// re-warns instead of staying silent forever after the first miss.
const URL_FOR_WARN_COOLDOWN_MS = 5 * 60 * 1000;
let urlForLastWarnedAt = 0;
export function urlFor(blob: { key: string }): string | null {
  try {
    return getStorage().publicUrl(blob.key);
  } catch (err) {
    const now = Date.now();
    if (now - urlForLastWarnedAt > URL_FOR_WARN_COOLDOWN_MS) {
      urlForLastWarnedAt = now;
      console.warn(
        `[attachments] urlFor() returning null — storage not configured: ${err instanceof Error ? err.message : err}`,
      );
    }
    return null;
  }
}

// The database deletes a deleted user's or character's attachments. Archiving one
// keeps them: call this when the archive is for good (account deletion), so the
// sweep can reclaim their blobs.
export async function purgeAttachmentsForRecords(tx: Db, recordType: string, recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  await Attachments.delete(tx, { recordType, recordIds });
}

export async function urlForSlot(recordType: string, recordId: string, name: string): Promise<string | null> {
  const row = await Attachments.findOneWithBlob(db, { recordType, recordId, name });
  return row ? urlFor(row) : null;
}
