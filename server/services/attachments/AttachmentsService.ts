import { createHmac, randomUUID } from "node:crypto";

import type { Db } from "@/drizzle/database.ts";
import { compareInConstantTime } from "@/server/constantTime.ts";
import { db, withUniqueRefusal } from "@/server/database/index.ts";
import { readEnv } from "@/server/environment.ts";
import { BadRequestError, ConflictError, InternalError, NotFoundError } from "@/server/errors/index.ts";
import { Attachments, Blobs } from "@/server/repositories/index.ts";
import { getFileEditableDocument, getFileReadableDocument } from "@/server/services/campaigns/documents/index.ts";
import { getPortraitEditableCharacter } from "@/server/services/characters/index.ts";
import { withAttachmentWrite, withBlobDeletion, withNewBlob } from "@/server/services/writes/index.ts";
import {
  createTextCheck,
  detectDocumentFileType,
  detectImageType,
  FILE_HEAD_BYTES,
} from "@/server/storage/fileTypes.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
import { UploadQueue } from "@/server/storage/UploadQueue.ts";
import {
  ALLOWED_DOCUMENT_FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  ATTACHMENT_SLOTS,
  DOCUMENT_FILE_SLOT,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_UPLOAD_BYTES,
} from "@/shared/attachments.ts";
import type { Session } from "@/shared/relations.ts";

import { getAvatarEditableUser } from "./editableUser.ts";

interface AttachableConfig {
  canAttach: AttachRight;
  /**
   * Who reads its files, for a record type whose files are private (a campaign document's): read through its own
   * route, its bytes handed on by the server (`getAttachmentFile`), never a public URL. None for a display asset, whose
   * public URL any signed-in session reads.
   */
  canRead?: AttachRight;
  /**
   * The type a file's head says it is (its first `FILE_HEAD_BYTES`, and its name, `filename`, for a text file or a
   * Word document, whose head says no more), of those its record type takes, or null for any other: what it's stored
   * as. A text file's bytes are checked as they're stored (`readChecked`).
   */
  detect: (head: Uint8Array, filename: string) => string | null;
  /** Whether a file goes straight to the storage (`createDirectUpload`), unread, or through the server alone. */
  directUpload: boolean;
  names: readonly string[];
  policy: UploadPolicy;
  /** What a file it refuses isn't, in a refusal's words: "a PNG, JPEG, WebP or GIF image". */
  takes: string;
}

interface SignedTokenPayload {
  blobId: string;
  iat: number;
  name: string;
  recordId: string;
  recordType: string;
}
interface UploadPolicy {
  contentTypes: string[];
  maxBytes: number;
}

/**
 * Refuses a session that may not change a record's attachments (`recordId`), read through `database` (a write's, under
 * the record's lock), with its record type's policy's refusal: what it answers otherwise goes unread (each guard
 * answers its record).
 */
type AttachRight = (database: Db, session: Session, recordId: string) => Promise<unknown>;

/**
 * A file the server takes, its bytes read as they come (`stream`), never held whole: a form's file, or a request's
 * body, under its name (`name`), and its size when it's known before it's read (`size`, a form's file's).
 */
export type IncomingFile = Pick<File, "name" | "stream"> & { size?: number };

const imagePolicy: UploadPolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  contentTypes: [...ALLOWED_IMAGE_TYPES],
};

/** An image's: what it is, how it's read off its bytes, and that it may go straight to the storage. */
const image = {
  detect: detectImageType,
  directUpload: true,
  policy: imagePolicy,
  takes: "a PNG, JPEG, WebP or GIF image",
};

/**
 * The records that take attachments: who may attach to one, what they take, under which names, and who reads them. Any
 * signed-in session reads an avatar's or a portrait's: display assets, whose URL adds no exposure beyond its page. A
 * campaign document's file is private: read through its document's route by whoever sees the document.
 */
const ATTACHABLE_TYPES = new Map<string, AttachableConfig>([
  [
    ATTACHMENT_SLOTS.avatar.recordType,
    {
      // The account's own: its policy refuses anyone else (a 403)
      canAttach: getAvatarEditableUser,
      ...image,
      names: [ATTACHMENT_SLOTS.avatar.name],
    },
  ],
  [
    ATTACHMENT_SLOTS.portrait.recordType,
    {
      // A player character's is its owner's alone; a child's (3.5's bonded creature), whoever edits its parent: its
      // policy refuses anyone else, with its own status (the 404 an unknown character gets, an archived one's 409)
      canAttach: getPortraitEditableCharacter,
      ...image,
      names: [ATTACHMENT_SLOTS.portrait.name],
    },
  ],
  [
    DOCUMENT_FILE_SLOT.recordType,
    {
      // Its campaign's Game Masters change it; whoever sees the document reads it, through the server, its bytes read
      // first, so a file goes through it, never straight to the storage
      canAttach: getFileEditableDocument,
      canRead: getFileReadableDocument,
      detect: detectDocumentFileType,
      directUpload: false,
      names: [DOCUMENT_FILE_SLOT.name],
      policy: { maxBytes: MAX_DOCUMENT_FILE_BYTES, contentTypes: [...ALLOWED_DOCUMENT_FILE_TYPES] },
      takes: "a picture, a PDF, a Word document (.docx) or a text file (.txt or .md, saved as UTF-8)",
    },
  ],
]);

/** The longest name a file is stored under, as most file systems take. */
const MAX_FILENAME_LENGTH = 255;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The uploads the server stores at once, the others waiting their turn (`UploadQueue`): each holds up to about 17 MB
 * as it's streamed to S3 (its part, as Bun holds it), so they hold under 200 MB together. One waits 30 seconds at most,
 * and a user holds 3 at most, running or waiting, so none takes every turn.
 */
const UPLOAD_QUEUE = { limit: 10, maxWaitMs: 30_000, perOwner: 3 };

/** The longest an upload takes, once its turn has come: one that trickles in is refused, freeing its turn. */
const UPLOAD_TIME_LIMIT_MS = 10 * 60_000;

/**
 * A file's bytes as they're stored: its head (`head`, read for its type), then the rest as it comes (`reader`),
 * counted into `read`, refused once past `maxBytes`, past its `deadline`, and for a text file (`text`), once they stop
 * being text (`createTextCheck`, `takes` its refusal's words). A refusal fails the read, and the storage keeps nothing.
 */
async function* readChecked(
  head: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  check: { deadline: number; maxBytes: number; read: { bytes: number }; takes: string; text: boolean },
) {
  const textCheck = check.text ? createTextCheck() : null;
  const accept = (chunk: Uint8Array) => {
    if (Date.now() > check.deadline) throw new BadRequestError("The upload took too long: try a faster connection");
    check.read.bytes += chunk.byteLength;
    if (check.read.bytes > check.maxBytes)
      throw new BadRequestError(`File exceeds maximum size of ${check.maxBytes} bytes`);
    if (textCheck && !textCheck.push(chunk)) throw new BadRequestError(`The file isn't ${check.takes}`);
    return chunk;
  };
  if (head.byteLength > 0) yield accept(head);
  for (let next = await readNext(reader); !next.done; next = await readNext(reader)) yield accept(next.value);
  if (textCheck && !textCheck.end()) throw new BadRequestError(`The file isn't ${check.takes}`);
}

/** A file's first bytes, its head (`FILE_HEAD_BYTES`), which its type is read from: fewer for a shorter file. */
async function readHead(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < FILE_HEAD_BYTES) {
    const { done, value } = await readNext(reader);
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
  }
  return Buffer.concat(chunks);
}

/**
 * A body's next chunk: one cut off before its end (its client gone, its connection timed out) refused as a bad
 * request, a client's doing, never the server's error.
 */
async function readNext(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    return await reader.read();
  } catch {
    throw new BadRequestError("The upload was cut off before its end");
  }
}

class AttachmentsService {
  /** The uploads being stored, and those waiting their turn (`UPLOAD_QUEUE`). */
  private readonly uploads = new UploadQueue(UPLOAD_QUEUE);

  /** Refuses a record type whose files go through the server alone (`directUpload`: a campaign document's). */
  private assertDirectUpload(recordType: string) {
    if (!this.getAttachableConfig(recordType).directUpload)
      throw new BadRequestError(`${recordType} files are uploaded through their own route`);
  }

  /** Refuses a record type whose files aren't private (`canRead`) to the private files' methods, as one that takes none. */
  private assertPrivateType(recordType: string) {
    if (!this.getAttachableConfig(recordType).canRead)
      throw new BadRequestError(`Unsupported record type: ${recordType}`);
  }

  /**
   * Refuses a record type whose files are private (a campaign document's, `canRead`) to the generic attachment routes,
   * as one that takes none: its own routes read and change it, and refresh whoever sees it.
   */
  private assertPublicType(recordType: string) {
    if (this.getAttachableConfig(recordType).canRead)
      throw new BadRequestError(`Unsupported record type: ${recordType}`);
  }

  private assertValidName(recordType: string, name: string): void {
    const { names } = this.getAttachableConfig(recordType);
    if (!names.includes(name)) throw new BadRequestError(`Slot "${name}" is not allowed for ${recordType}`);
  }

  private assertWithinPolicy(recordType: string, byteSize: number, contentType: string): void {
    const { policy } = this.getAttachableConfig(recordType);
    if (byteSize > policy.maxBytes) throw new BadRequestError(`File exceeds maximum size of ${policy.maxBytes} bytes`);

    if (!policy.contentTypes.includes(contentType))
      throw new BadRequestError(`Content type "${contentType}" is not allowed for ${recordType}`);
  }

  /** A blob's storage key: its id, then its file's name made safe, "file" when nothing but dots would be left. */
  private buildKey(blobId: string, filename: string): string {
    const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
    return `blobs/${blobId}/${/^\.*$/.test(safe) ? "file" : safe}`;
  }

  /**
   * The name a file is stored and shown under (a document's file's, to its players too): without control characters
   * nor the marks that reverse its text ("map\u202Egnp.exe"), at most `MAX_FILENAME_LENGTH` characters, "file" if none
   * is left.
   */
  private cleanFilename(name: string): string {
    const cleaned = name.replace(/[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").trim();
    return cleaned.slice(0, MAX_FILENAME_LENGTH) || "file";
  }

  /** What a private file's slot holds, as its record's answers say it: its name, type, size and upload time. */
  private describeFile(blob: { byteSize: number; contentType: string; createdAt: string; filename: string }) {
    return { name: blob.filename, contentType: blob.contentType, byteSize: blob.byteSize, uploadedAt: blob.createdAt };
  }

  private getAttachableConfig(recordType: string): AttachableConfig {
    const config = ATTACHABLE_TYPES.get(recordType);
    if (!config) throw new BadRequestError(`Unsupported record type: ${recordType}`);
    return config;
  }

  private getSigningSecret(): string {
    const secret = readEnv("SIGNING_SECRET");
    if (!secret) throw new InternalError("SIGNING_SECRET is not configured");
    return secret;
  }

  private signToken(payload: Omit<SignedTokenPayload, "iat">): string {
    const full: SignedTokenPayload = { ...payload, iat: Date.now() };
    // Top-level key sort gives stable serialization since SignedTokenPayload
    // is flat. Switch to a recursive canonical serializer if any field ever
    // becomes a nested object.
    const data = Buffer.from(JSON.stringify(full, Object.keys(full).sort())).toString("base64url");
    const sig = createHmac("sha256", this.getSigningSecret()).update(data).digest("base64url");
    return `${data}.${sig}`;
  }

  private verifyToken(token: string): SignedTokenPayload {
    const [data, sig] = token.split(".");
    if (!data || !sig) throw new BadRequestError("Invalid signed id");
    const expected = createHmac("sha256", this.getSigningSecret()).update(data).digest("base64url");
    if (!compareInConstantTime(sig, expected)) throw new BadRequestError("Invalid signed id");

    let payload: SignedTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(data, "base64url").toString());
    } catch {
      throw new BadRequestError("Invalid signed id");
    }
    if (typeof payload.iat !== "number" || Date.now() - payload.iat > TOKEN_TTL_MS)
      throw new BadRequestError("Signed id has expired");

    return payload;
  }

  /**
   * Refuses a session that may not change the record's attachments, with its record type's own refusal (`canAttach`),
   * read through `database`: before a write's work, and again under its record's lock (`withAttachmentWrite`), as the
   * writes before it left the record.
   */
  private async assertCanAttach(database: Db, session: Session, recordType: string, recordId: string): Promise<void> {
    await this.getAttachableConfig(recordType).canAttach(database, session, recordId);
  }

  /**
   * Puts a stored blob in its slot, replacing the attachment there: its record locked, then the blob, so the sweep of
   * unattached blobs can't take it meanwhile (`withAttachmentWrite`), the session's right on the record asked again
   * under the lock, and marked attached. Answers the old attachment's blob when nothing else holds it.
   */
  private async attachBlob(
    session: Session,
    slot: { name: string; recordId: string; recordType: string },
    blobId: string,
  ) {
    return await withAttachmentWrite(
      slot,
      async (tx: Db) => {
        await this.assertCanAttach(tx, session, slot.recordType, slot.recordId);
        return await this.fillSlot(tx, slot, blobId);
      },
      blobId,
    );
  }

  /**
   * Deletes an attachment the session may change (`found`, read before the lock: its record never changes), asked again
   * under its record's lock, and its blob's file when nothing else holds it.
   */
  private async deleteAttachment(session: Session, found: { id: string; recordId: string; recordType: string }) {
    await this.assertCanAttach(db, session, found.recordType, found.recordId);
    const result = await withAttachmentWrite(found, async (tx: Db) => {
      await this.assertCanAttach(tx, session, found.recordType, found.recordId);
      const attachment = await Attachments.findOne(tx, { id: found.id });
      if (!attachment) throw new NotFoundError("Attachment not found");

      await Attachments.delete(tx, { id: attachment.id });
      const orphan = await this.findOrphanedBlob(tx, attachment.blobId);
      return { id: attachment.id, orphan };
    });

    await this.purgeOrphan(result.orphan);
    return { id: result.id };
  }

  /**
   * Puts a stored blob (`blobId`) in its slot, replacing the attachment there, in a write that holds its record's lock
   * and the blob's, and marks it attached. Answers the old attachment's blob when nothing else holds it.
   */
  private async fillSlot(tx: Db, slot: { name: string; recordId: string; recordType: string }, blobId: string) {
    const blob = await Blobs.findOne(tx, { id: blobId });
    if (!blob) throw new NotFoundError("Blob not found");
    if (blob.attachedAt) throw new ConflictError("Blob is already attached");

    const where = { recordType: slot.recordType, recordId: slot.recordId, name: slot.name };
    const existing = await Attachments.findOne(tx, where);
    if (existing) await Attachments.delete(tx, { id: existing.id });

    const [attachment] = await withUniqueRefusal(
      () => Attachments.create(tx, { ...where, blobId: blob.id }),
      () => new ConflictError("Slot is already attached by a concurrent request"),
    );
    if (!attachment) throw new InternalError("Failed to create attachment");

    const updated = await Blobs.update(tx, { attachedAt: new Date().toISOString() }, { id: blob.id });
    const orphan = existing ? await this.findOrphanedBlob(tx, existing.blobId) : null;
    return { attachment, blob: updated[0] ?? blob, orphan };
  }

  private async findOrphanedBlob(tx: Db, blobId: string): Promise<{ id: string; key: string } | null> {
    const refs = await Attachments.findMany(tx, { blobIds: [blobId] });
    if (refs.length > 0) return null;
    const blob = await Blobs.findOne(tx, { id: blobId });
    if (!blob) return null;
    return { id: blob.id, key: blob.key };
  }

  private async purgeOrphan(orphan: { id: string; key: string } | null): Promise<void> {
    if (!orphan) return;
    try {
      await ObjectStorage.get().deleteObject(orphan.key);
      await withBlobDeletion(orphan.id, (tx) => Blobs.delete(tx, { id: orphan.id }));
    } catch (error) {
      console.warn(
        `[attachments] Storage cleanup failed for ${orphan.key}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Stores a file a record type takes (`recordType`), ahead of its attach, streamed, never held whole: its type read
   * from its head (and its name, for one with no signature), within its record type's policy, as a pending blob first,
   * so one a crash leaves unattached is swept with its row, then put in storage as its bytes come, checked as they go
   * (`readChecked`), and its size and upload time noted once they're all stored, its turn waited for first, its
   * uploader's (`owner`, `UploadQueue`). A failed write deletes what it stored. Answers its blob.
   */
  private async storeFile(owner: string, recordType: string, file: IncomingFile) {
    return await this.uploads.run(owner, () => this.streamFile(recordType, file));
  }

  /** Stores a file as `storeFile` says, once its turn has come. */
  private async streamFile(recordType: string, file: IncomingFile) {
    const config = this.getAttachableConfig(recordType);
    const filename = this.cleanFilename(file.name);
    const reader = file.stream().getReader();
    try {
      const deadline = Date.now() + UPLOAD_TIME_LIMIT_MS;
      const head = await readHead(reader);
      const contentType = config.detect(head, filename);
      if (!contentType) throw new BadRequestError(`The file isn't ${config.takes}`);
      this.assertWithinPolicy(recordType, file.size ?? head.byteLength, contentType);

      const id = randomUUID();
      const key = this.buildKey(id, filename);
      // Its size and upload time, known once it's stored
      await withNewBlob((tx) => Blobs.create(tx, { id, key, filename, contentType, byteSize: 0 }));
      try {
        const read = { bytes: 0 };
        const check = {
          deadline,
          maxBytes: config.policy.maxBytes,
          read,
          takes: config.takes,
          text: contentType === "text/plain",
        };
        await ObjectStorage.get().putObject(key, readChecked(head, reader, check), { contentType });
        // Uploaded once it's stored whole, which its page says, and the sweep of pending blobs counts from
        const uploaded = { byteSize: read.bytes, createdAt: new Date().toISOString() };
        await withNewBlob((tx) => Blobs.update(tx, uploaded, { id }));
      } catch (error) {
        await this.purgeOrphan({ id, key });
        throw error;
      }
      return { id, key };
    } finally {
      // A file refused before it's read whole: the rest of its body is let go, not left open
      await reader.cancel().catch(() => undefined);
    }
  }

  /**
   * Uploads a file through the server into its slot, at once: stored (`storeFile`), then attached. A failed attach
   * deletes what it stored. Answers the attachment and its blob.
   */
  private async uploadFile(
    session: Session,
    slot: { name: string; recordId: string; recordType: string },
    file: IncomingFile,
  ) {
    await this.assertCanAttach(db, session, slot.recordType, slot.recordId);
    this.assertValidName(slot.recordType, slot.name);
    const stored = await this.storeFile(session.userId, slot.recordType, file);

    let result;
    try {
      result = await this.attachBlob(session, slot, stored.id);
    } catch (error) {
      await this.purgeOrphan(stored);
      throw error;
    }
    await this.purgeOrphan(result.orphan);
    return result;
  }

  async attach(session: Session, signedId: string) {
    const payload = this.verifyToken(signedId);
    this.assertDirectUpload(payload.recordType);
    await this.assertCanAttach(db, session, payload.recordType, payload.recordId);
    this.assertValidName(payload.recordType, payload.name);

    // Check upload size before opening the tx — S3 round-trip would otherwise
    // hold a DB connection for the duration. The one-shot recheck inside the
    // tx still catches concurrent attaches.
    //
    // Race: if a client takes >2h between upload and attach, the sweep can
    // delete preBlob between this read and the tx — Blobs.findOne(tx) below
    // returns undefined and we throw NotFoundError. Fails loud, not silent.
    const preBlob = await Blobs.findOne(db, { id: payload.blobId });
    if (!preBlob) throw new NotFoundError("Blob not found");
    if (preBlob.attachedAt) throw new ConflictError("Blob is already attached");

    const stats = await ObjectStorage.get().objectStats(preBlob.key);
    if (!stats) throw new BadRequestError("Upload not found at expected key");
    if (stats.size !== preBlob.byteSize)
      throw new BadRequestError(`Upload size ${stats.size} does not match declared byteSize ${preBlob.byteSize}`);

    const result = await this.attachBlob(session, payload, payload.blobId);

    await this.purgeOrphan(result.orphan);
    return { attachment: result.attachment, blob: result.blob };
  }

  /**
   * Puts a private file stored ahead of its record (`pending`, `createPendingFile`) in the record's slot, in the write
   * that creates the record (`tx`), which holds the record's lock and the blob's and has asked its policy: the record
   * and its file are stored together, or neither. Answers what the slot holds: its name, type, size and upload time.
   */
  async attachPendingFile(
    tx: Db,
    slot: { name: string; recordId: string; recordType: string },
    pending: { id: string },
  ) {
    this.assertPrivateType(slot.recordType);
    this.assertValidName(slot.recordType, slot.name);
    const { blob } = await this.fillSlot(tx, slot, pending.id);
    return this.describeFile(blob);
  }

  async createDirectUpload(
    session: Session,
    params: {
      byteSize: number;
      contentType: string;
      filename: string;
      name: string;
      recordId: string;
      recordType: string;
    },
  ) {
    // A record type whose files go through the server is refused before anything is read of its record: its answer
    // would say whether the record exists
    this.assertDirectUpload(params.recordType);
    await this.assertCanAttach(db, session, params.recordType, params.recordId);
    this.assertValidName(params.recordType, params.name);
    this.assertWithinPolicy(params.recordType, params.byteSize, params.contentType);

    const blobId = randomUUID();
    const key = this.buildKey(blobId, params.filename);

    const blob = await withNewBlob(async (tx: Db) => {
      const rows = await Blobs.create(tx, {
        id: blobId,
        key,
        filename: params.filename,
        contentType: params.contentType,
        byteSize: params.byteSize,
      });
      const row = rows[0];
      if (!row) throw new InternalError("Failed to create blob");
      return row;
    });

    const presignedUrl = ObjectStorage.get().presignPut(key, {
      byteSize: params.byteSize,
      contentType: params.contentType,
    });
    const signedId = this.signToken({
      blobId: blob.id,
      recordType: params.recordType,
      recordId: params.recordId,
      name: params.name,
    });

    return {
      signedId,
      presignedUrl,
      headers: { "Content-Type": params.contentType },
    };
  }

  /**
   * Takes a browser's upload to the server's disk, at the link `createDirectUpload` signed (`DiskStorageBackend`): its
   * signature and expiry first, then its blob, which must still wait for its file (stored, not yet attached), so a link
   * replayed after its blob was attached, removed or swept stores nothing. One its link already filled is refused too.
   */
  async createDiskUpload(key: string, query: Record<string, string | undefined>, request: Request) {
    const disk = ObjectStorage.findDisk();
    if (!disk) throw new NotFoundError("File not found");
    const grant = disk.verifyGrant(key, query);
    const blob = await Blobs.findOne(db, { key });
    if (!blob || blob.attachedAt) throw new ConflictError("This upload link was already used");
    await disk.receiveUpload(key, grant, request);
  }

  /**
   * Stores a private file (a campaign document's) ahead of the record it's for, which its write then attaches
   * (`attachPendingFile`) or, failing, removes (`removePendingFile`). Its caller has asked who may (`session`). Answers
   * its blob.
   */
  async createPendingFile(session: Session, recordType: string, file: IncomingFile) {
    this.assertPrivateType(recordType);
    return await this.storeFile(session.userId, recordType, file);
  }

  /** Removes a display asset (an avatar, a portrait): a private file's attachment is answered as an unknown one. */
  async detach(session: Session, attachmentId: string) {
    const found = await Attachments.findOne(db, { id: attachmentId });
    if (!found || this.getAttachableConfig(found.recordType).canRead) throw new NotFoundError("Attachment not found");
    return await this.deleteAttachment(session, found);
  }

  async getAttachment(params: { name: string; recordId: string; recordType: string }) {
    // A record type that takes no attachments is refused, as a write's is, and so is a private one's, whose route reads it
    this.assertPublicType(params.recordType);
    const row = await Attachments.findOneWithBlob(db, {
      recordType: params.recordType,
      recordId: params.recordId,
      name: params.name,
    });
    if (!row) return null;
    return { id: row.id, url: ObjectStorage.findPublicUrl(row.key) };
  }

  /**
   * A private file (a campaign document's), for whoever may read its record (`canRead`): its bytes as they come from
   * the storage (`stream`, never held whole), with how many there are, its type and its name. The server hands them on,
   * so no URL to it ever leaves it. One its record type keeps public is refused, as an empty slot is not found.
   */
  async getAttachmentFile(session: Session, params: { name: string; recordId: string; recordType: string }) {
    this.assertPrivateType(params.recordType);
    await this.getAttachableConfig(params.recordType).canRead?.(db, session, params.recordId);
    this.assertValidName(params.recordType, params.name);
    const row = await Attachments.findOneWithBlob(db, params);
    const stored = row && (await ObjectStorage.get().streamObject(row.key));
    if (!row || !stored) throw new NotFoundError("File not found");
    return { byteSize: stored.size, contentType: row.contentType, filename: row.filename, stream: stored.stream };
  }

  /**
   * Removes a private file stored ahead of its record (`createPendingFile`) that its record's write failed to attach:
   * its stored file, and its row.
   */
  async removePendingFile(pending: { id: string; key: string }) {
    // A write that failed after its commit went through left the file attached: it stays its record's
    const held = await Attachments.findMany(db, { blobIds: [pending.id] });
    if (held.length === 0) await this.purgeOrphan(pending);
  }

  /**
   * Uploads a display asset (an avatar, a portrait) through the server into its slot (`uploadFile`), replacing the one
   * there. Answers the attachment as its read does: its id and its image's URL.
   */
  async setAttachment(session: Session, recordType: string, recordId: string, name: string, file: File) {
    this.assertPublicType(recordType);
    const result = await this.uploadFile(session, { name, recordId, recordType }, file);
    return { id: result.attachment.id, url: ObjectStorage.findPublicUrl(result.blob.key) };
  }

  /**
   * Uploads a private file (a campaign document's) into its slot (`uploadFile`), replacing the one there. Answers what
   * the slot now holds, its name, type, size and upload time: no URL to it, whose bytes its record's route hands on.
   */
  async setAttachmentFile(
    session: Session,
    slot: { name: string; recordId: string; recordType: string },
    file: IncomingFile,
  ) {
    this.assertPrivateType(slot.recordType);
    const { blob } = await this.uploadFile(session, slot, file);
    return this.describeFile(blob);
  }
}

export default new AttachmentsService();
