import { type Db, db } from "@/server/database/index.ts";
import { Attachments } from "@/server/repositories/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";

/** An attachment's public URL, or null when storage isn't configured. */
export function getPublicUrl(blob: { key: string }): string | null {
  return ObjectStorage.findPublicUrl(blob.key);
}

export async function getSlotUrl(recordType: string, recordId: string, name: string): Promise<string | null> {
  const row = await Attachments.findOneWithBlob(db, { recordType, recordId, name });
  return row ? getPublicUrl(row) : null;
}

/**
 * The database deletes a deleted user's or character's attachments. Archiving one keeps them: call this when the
 * archive is for good (account deletion), so the sweep can reclaim their blobs.
 */
export async function purgeAttachmentsForRecords(tx: Db, recordType: string, recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  await Attachments.delete(tx, { recordType, recordIds });
}
