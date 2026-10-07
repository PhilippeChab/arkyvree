import { db } from "@/server/database/index.ts";
import { Attachments, Blobs, Exports } from "@/server/repositories/index.ts";

import { uniqueId } from "./seed.ts";

/** A PDF export of `userId`'s, valid for an hour unless `expiresAt` says otherwise. */
export async function createExport(userId: string, expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()) {
  const [record] = await Exports.create(db, {
    userId,
    type: "pdf",
    mimeType: "application/pdf",
    fileName: "test-sheet.pdf",
    data: Buffer.from("fake pdf content"),
    expiresAt,
  });
  return record;
}

/** An image attached to a user (its avatar) or a character (its portrait), written straight to the database. */
export async function createTestAttachment(recordType: "User" | "Character", recordId: string) {
  const [blob] = await Blobs.create(db, {
    key: `blobs/${uniqueId()}/image.png`,
    filename: "image.png",
    contentType: "image/png",
    byteSize: 100,
    attachedAt: new Date().toISOString(),
  });
  const name = recordType === "User" ? "avatar" : "portrait";
  const [attachment] = await Attachments.create(db, { recordType, recordId, name, blobId: blob.id });
  return attachment;
}
