import { db } from "@/server/database/index.ts";
import { Attachments, Blobs, Exports } from "@/server/repositories/index.ts";
import { ATTACHMENT_SLOTS, type AttachmentSlotName } from "@/shared/attachments.ts";
import type { ExportStatus } from "@/shared/enums.ts";

import { uniqueId } from "./seed.ts";

/**
 * A PDF export of `userId`'s, valid for an hour unless `expiresAt` says otherwise: its file, ready, unless `status`
 * says it's pending (no file yet) or failed.
 */
export async function createExport(
  userId: string,
  expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  status: ExportStatus = "ready",
) {
  const [record] = await Exports.create(db, {
    userId,
    type: "pdf",
    mimeType: "application/pdf",
    fileName: "test-sheet.pdf",
    data: status === "ready" ? Buffer.from("fake pdf content") : null,
    expiresAt,
    status,
  });
  return record;
}

/** An image in a record's slot (a user's avatar, a character's portrait), written straight to the database. */
export async function createTestAttachment(slot: AttachmentSlotName, recordId: string) {
  const [blob] = await Blobs.create(db, {
    key: `blobs/${uniqueId()}/image.png`,
    filename: "image.png",
    contentType: "image/png",
    byteSize: 100,
    attachedAt: new Date().toISOString(),
  });
  const { name, recordType } = ATTACHMENT_SLOTS[slot];
  const [attachment] = await Attachments.create(db, { recordType, recordId, name, blobId: blob.id });
  return attachment;
}
