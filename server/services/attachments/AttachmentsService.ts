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
import ObjectStorage from "@/server/storage/ObjectStorage.ts";
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
import { detectDocumentFileType, detectImageType } from "./imageTypes.ts";

interface AttachableConfig {
  canAttach: AttachRight;
  /**
   * Who reads its files, for a record type whose files are private (a campaign document's): read through its own
   * route, its bytes handed on by the server (`getAttachmentFile`), never a public URL. None for a display asset, whose
   * public URL any signed-in session reads.
   */
  canRead?: AttachRight;
  /** The type a file's bytes say it is, of those its record type takes, or null for any other: what it's stored as. */
  detect: (data: Uint8Array) => string | null;
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
      // The account's own, which a demo's doesn't take: it stores no file, as its records' policies refuse one. Its
      // policy refuses anyone else (a 403)
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
      takes: "an image or a PDF",
    },
  ],
]);

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

class AttachmentsService {
  /** Refuses a record type whose files go through the server alone (`directUpload`: a campaign document's). */
  private assertDirectUpload(recordType: string) {
    if (!this.getAttachableConfig(recordType).directUpload)
      throw new BadRequestError(`${recordType} files are uploaded through their own route`);
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

  private buildKey(blobId: string, filename: string): string {
    const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200) || "file";
    return `blobs/${blobId}/${safe}`;
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
        const blob = await Blobs.findOne(tx, { id: blobId });
        if (!blob) throw new NotFoundError("Blob not found");
        if (blob.attachedAt) throw new ConflictError("Blob is already attached");

        const existing = await Attachments.findOne(tx, {
          recordType: slot.recordType,
          recordId: slot.recordId,
          name: slot.name,
        });
        if (existing) await Attachments.delete(tx, { id: existing.id });

        const [attachment] = await withUniqueRefusal(
          () =>
            Attachments.create(tx, {
              recordType: slot.recordType,
              recordId: slot.recordId,
              name: slot.name,
              blobId: blob.id,
            }),
          () => new ConflictError("Slot is already attached by a concurrent request"),
        );
        if (!attachment) throw new InternalError("Failed to create attachment");

        const updated = await Blobs.update(tx, { attachedAt: new Date().toISOString() }, { id: blob.id });
        const attachedBlob = updated[0] ?? blob;

        const orphan = existing ? await this.findOrphanedBlob(tx, existing.blobId) : null;

        return { attachment, blob: attachedBlob, orphan };
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
        `[attachments] S3 cleanup failed for ${orphan.key}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Uploads a file through the server into its slot, at once: its type read from its bytes, stored as a pending blob
   * first, so one a crash leaves unattached is swept with its row, then put in storage and attached. A failed write or
   * attach deletes what it stored. Answers the attachment and its blob.
   */
  private async uploadFile(session: Session, slot: { name: string; recordId: string; recordType: string }, file: File) {
    await this.assertCanAttach(db, session, slot.recordType, slot.recordId);
    this.assertValidName(slot.recordType, slot.name);

    const data = new Uint8Array(await file.arrayBuffer());
    const config = this.getAttachableConfig(slot.recordType);
    const contentType = config.detect(data);
    if (!contentType) throw new BadRequestError(`The file isn't ${config.takes}`);
    this.assertWithinPolicy(slot.recordType, data.byteLength, contentType);

    const blobId = randomUUID();
    const key = this.buildKey(blobId, file.name);
    await withNewBlob((tx) =>
      Blobs.create(tx, { id: blobId, key, filename: file.name || "file", contentType, byteSize: data.byteLength }),
    );

    let result;
    try {
      await ObjectStorage.get().putObject(key, data, { contentType });
      result = await this.attachBlob(session, slot, blobId);
    } catch (error) {
      await this.purgeOrphan({ id: blobId, key });
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
    await this.assertCanAttach(db, session, params.recordType, params.recordId);
    this.assertDirectUpload(params.recordType);
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
   * A private file's bytes (a campaign document's), for whoever may read its record (`canRead`), its type and name with
   * them: the server hands them on, so no URL to it ever leaves it. One its record type keeps public is refused, as an
   * empty slot is not found.
   */
  async getAttachmentFile(session: Session, params: { name: string; recordId: string; recordType: string }) {
    const { canRead } = this.getAttachableConfig(params.recordType);
    if (!canRead) throw new BadRequestError(`Unsupported record type: ${params.recordType}`);
    await canRead(db, session, params.recordId);
    this.assertValidName(params.recordType, params.name);
    const row = await Attachments.findOneWithBlob(db, params);
    const data = row && (await ObjectStorage.get().readObject(row.key));
    if (!row || !data) throw new NotFoundError("File not found");
    return { contentType: row.contentType, data, filename: row.filename };
  }

  /**
   * Removes a private file from its slot (a campaign document's), for whoever may change its record (`canAttach`): an
   * empty slot is not found.
   */
  async removeAttachmentFile(session: Session, slot: { name: string; recordId: string; recordType: string }) {
    const { canRead } = this.getAttachableConfig(slot.recordType);
    if (!canRead) throw new BadRequestError(`Unsupported record type: ${slot.recordType}`);
    await this.assertCanAttach(db, session, slot.recordType, slot.recordId);
    const found = await Attachments.findOne(db, slot);
    if (!found) throw new NotFoundError("File not found");
    return await this.deleteAttachment(session, found);
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
   * Uploads a private file (a campaign document's image or PDF) into its slot (`uploadFile`), replacing the one there.
   * Answers what the slot now holds, its name, type, size and upload time: no URL to it, whose bytes its record's route
   * hands on.
   */
  async setAttachmentFile(session: Session, slot: { name: string; recordId: string; recordType: string }, file: File) {
    const { canRead } = this.getAttachableConfig(slot.recordType);
    if (!canRead) throw new BadRequestError(`Unsupported record type: ${slot.recordType}`);
    const { blob } = await this.uploadFile(session, slot, file);
    return { name: blob.filename, contentType: blob.contentType, byteSize: blob.byteSize, uploadedAt: blob.createdAt };
  }
}

export default new AttachmentsService();
