import type { Db } from "@/drizzle/database.ts";
import { blobsInStorage } from "@/drizzle/schema.ts";
import { withWrite } from "@/server/database/index.ts";
import { NotFoundError, UnauthorizedError } from "@/server/errors/index.ts";
import { Documents, isVisible, Locks, Visibility } from "@/server/repositories/index.ts";
import { ATTACHMENT_SLOTS, DOCUMENT_FILE_SLOT } from "@/shared/attachments.ts";

import { lockNamedCharacter } from "./characterWrites.ts";

/** The record an attachment is of (`recordType`: a user's avatar, a character's portrait, a campaign document's file). */
interface AttachedRecord {
  recordId: string;
  recordType: string;
}

/** What an attachment's write that gave up on a lock answers: another save held its record or its image. */
const BUSY_ATTACHMENT_MESSAGE = "The image is being changed by another save; try again";

/**
 * Locks the campaign a document (`documentId`) is in, as its documents' writes lock it (`withCampaignWrite`): a
 * document's campaign never changes, so it's read before the lock; an unknown document is refused as not found.
 */
async function lockDocumentCampaign(tx: Db, documentId: string) {
  const document = await Documents.findOne(tx, { id: documentId });
  const locked = document && (await Locks.lockCampaigns(tx, { ids: [document.campaignId] }, "no key update"));
  if (!locked || locked.length === 0) throw new NotFoundError("Document not found in this campaign");
}

/**
 * Locks the record an attachment is of (`record`), as its own writes lock it: a user's row (refused as its session is,
 * 401, once it's gone), a campaign document's campaign (`lockDocumentCampaign`), a character's after its master's
 * (`lockNamedCharacter`; an unknown one refused as not found, an archived one locked, which its policy refuses).
 */
async function lockRecord(tx: Db, record: AttachedRecord) {
  if (record.recordType === ATTACHMENT_SLOTS.avatar.recordType) {
    const locked = await Locks.lockUser(tx, record.recordId, "no key update");
    if (!isVisible(locked, Visibility.UnarchivedOnly)) throw new UnauthorizedError("Invalid session");
    return;
  }
  if (record.recordType === DOCUMENT_FILE_SLOT.recordType) {
    await lockDocumentCampaign(tx, record.recordId);
    return;
  }
  await lockNamedCharacter(tx, record.recordId);
}

/**
 * Runs a write of a record's attachment (`record`: its attach, its detach), its record locked first (`lockRecord`), so
 * two of one slot take turns and the second replaces the first, then the image it attaches (`blobId`), so the sweep of
 * unattached images (`withBlobSweep`) doesn't delete it meanwhile. Whether the session may still change the record's
 * attachments, as the writes before it left the record (a character archived meanwhile), and whether the image is
 * there, are the write's to read.
 */
export async function withAttachmentWrite<T>(
  record: AttachedRecord,
  write: (tx: Db) => Promise<T>,
  blobId?: string,
): Promise<T> {
  return await withWrite(async (tx) => {
    await lockRecord(tx, record);
    if (blobId) await Locks.lockRow(tx, blobsInStorage, blobId, "no key update");
    return await write(tx);
  }, BUSY_ATTACHMENT_MESSAGE);
}

/**
 * Runs the delete of an image's row no attachment holds (`blobId`: the one an attach replaced or a detach removed, one
 * an upload stored and failed to attach), its row locked first, as the sweep's delete locks it (`withBlobSweep`), so
 * the two take turns on deleting the row. Its stored file is deleted before, outside the lock, where the sweep holds
 * its lock over both, which is harmless: a second delete of the file does nothing, nor does one of a row gone since.
 */
export async function withBlobDeletion<T>(blobId: string, write: (tx: Db) => Promise<T>): Promise<T> {
  return await withWrite(async (tx) => {
    await Locks.lockRow(tx, blobsInStorage, blobId, "update");
    return await write(tx);
  }, BUSY_ATTACHMENT_MESSAGE);
}

/**
 * Runs the sweep's delete of an unattached image (`blobId`), its row locked first: none when an attach holds it, which
 * the sweep skips rather than waits for, nor when it's gone.
 */
export async function withBlobSweep<T>(blobId: string, write: (tx: Db) => Promise<T>): Promise<T | undefined> {
  return await withWrite(async (tx) => {
    if (!(await Locks.lockRow(tx, blobsInStorage, blobId, "update", true))) return undefined;
    return await write(tx);
  }, BUSY_ATTACHMENT_MESSAGE);
}

/**
 * Runs the write of a new image's row (`write`: an upload's, pending until it's attached), which locks none: no other
 * write knows of the image yet, and no record holds it until its attach (`withAttachmentWrite`).
 */
export async function withNewBlob<T>(write: (tx: Db) => Promise<T>): Promise<T> {
  return await withWrite(write, BUSY_ATTACHMENT_MESSAGE);
}
