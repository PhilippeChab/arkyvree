import { type Db, db } from "@/server/database/index.ts";
import { Attachments } from "@/server/repositories/index.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { ATTACHMENT_SLOTS, type AttachmentSlotName } from "@/shared/attachments.ts";

/** An attachment's public URL, or null when storage isn't configured. */
export function getPublicUrl(blob: { key: string }): string | null {
  return ObjectStorage.findPublicUrl(blob.key);
}

/** The public URL of a record's image in `slot` (a character's portrait), or null without one. */
export async function getSlotUrl(slot: AttachmentSlotName, recordId: string): Promise<string | null> {
  const { name, recordType } = ATTACHMENT_SLOTS[slot];
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
