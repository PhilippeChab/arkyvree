import { type Db, db } from "@/server/database/index.ts";
import { Attachments } from "@/server/repositories/index.ts";
import { getStorage } from "@/server/storage/s3.ts";

// 5-minute cooldown so a credentials rotation that breaks getStorage()
// re-warns instead of staying silent forever after the first miss.
const PUBLIC_URL_WARN_COOLDOWN_MS = 5 * 60 * 1000;
let publicUrlLastWarnedAt = 0;
export function getPublicUrl(blob: { key: string }): string | null {
  try {
    return getStorage().publicUrl(blob.key);
  } catch (err) {
    const now = Date.now();
    if (now - publicUrlLastWarnedAt > PUBLIC_URL_WARN_COOLDOWN_MS) {
      publicUrlLastWarnedAt = now;
      console.warn(
        `[attachments] getPublicUrl() returning null — storage not configured: ${err instanceof Error ? err.message : err}`,
      );
    }
    return null;
  }
}

export async function getSlotUrl(recordType: string, recordId: string, name: string): Promise<string | null> {
  const row = await Attachments.findOneWithBlob(db, { recordType, recordId, name });
  return row ? getPublicUrl(row) : null;
}

// The database deletes a deleted user's or character's attachments. Archiving one
// keeps them: call this when the archive is for good (account deletion), so the
// sweep can reclaim their blobs.
export async function purgeAttachmentsForRecords(tx: Db, recordType: string, recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  await Attachments.delete(tx, { recordType, recordIds });
}
