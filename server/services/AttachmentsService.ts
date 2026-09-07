import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";

import { blobsInStorage } from "@/drizzle/schema.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from "@/server/errors/index.ts";
import { Attachments, Blobs, Characters } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { getStorage } from "@/server/storage/s3.ts";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/shared/attachments.ts";
import type { Session } from "@/shared/relations.ts";

type OwnershipChecker = (session: Session, recordId: string) => Promise<boolean>;
type UploadPolicy = { maxBytes: number; contentTypes: string[] };
type AttachableConfig = {
  isOwner: OwnershipChecker;
  isReader: OwnershipChecker;
  policy: UploadPolicy;
  names: readonly string[];
};

const ATTACHABLE_TYPES = new Map<string, AttachableConfig>();

export function registerAttachable(recordType: string, config: AttachableConfig): void {
  ATTACHABLE_TYPES.set(recordType, config);
}

// Avatars/portraits are display assets meant to be visible to authed users —
// the URL adds no exposure beyond the page (share-token gates that), so any
// signed-in session can read them.
const allowAuthenticated: OwnershipChecker = async () => true;

const imagePolicy: UploadPolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  contentTypes: [...ALLOWED_IMAGE_TYPES],
};

registerAttachable("User", {
  isOwner: async (session, recordId) => session.userId === recordId,
  isReader: allowAuthenticated,
  policy: imagePolicy,
  names: ["avatar"],
});

registerAttachable("Character", {
  isOwner: async (session, recordId) => {
    const character = await Characters.findOne(db, { id: recordId });
    if (!character) return false;
    if (character.kind === "pc") return character.userId === session.userId;
    // Bonded children flow permission through the master (owner or active contributor).
    if (!character.parentCharacterId) return false;
    const master = await Characters.findOneEditable(db, {
      id: character.parentCharacterId,
      userId: session.userId,
    });
    return !!master;
  },
  isReader: allowAuthenticated,
  policy: imagePolicy,
  names: ["portrait"],
});

function getAttachableConfig(recordType: string): AttachableConfig {
  const config = ATTACHABLE_TYPES.get(recordType);
  if (!config) throw new BadRequestError(`Unsupported record type: ${recordType}`);
  return config;
}

async function assertCanAttach(session: Session, recordType: string, recordId: string): Promise<void> {
  const config = getAttachableConfig(recordType);
  if (!(await config.isOwner(session, recordId))) {
    throw new ForbiddenError("Not authorized to attach to this record");
  }
}

async function assertCanRead(session: Session, recordType: string, recordId: string): Promise<void> {
  const config = getAttachableConfig(recordType);
  if (!(await config.isReader(session, recordId))) {
    throw new ForbiddenError("Not authorized to view this attachment");
  }
}

function assertWithinPolicy(recordType: string, byteSize: number, contentType: string): void {
  const { policy } = getAttachableConfig(recordType);
  if (byteSize > policy.maxBytes) {
    throw new BadRequestError(`File exceeds maximum size of ${policy.maxBytes} bytes`);
  }
  if (!policy.contentTypes.includes(contentType)) {
    throw new BadRequestError(`Content type "${contentType}" is not allowed for ${recordType}`);
  }
}

function assertValidName(recordType: string, name: string): void {
  const { names } = getAttachableConfig(recordType);
  if (!names.includes(name)) {
    throw new BadRequestError(`Slot "${name}" is not allowed for ${recordType}`);
  }
}

interface SignedTokenPayload {
  blobId: string;
  recordType: string;
  recordId: string;
  name: string;
  iat: number;
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getSigningSecret(): string {
  const secret = process.env.SIGNING_SECRET;
  if (!secret) throw new InternalError("SIGNING_SECRET is not configured");
  return secret;
}

function signToken(payload: Omit<SignedTokenPayload, "iat">): string {
  const full: SignedTokenPayload = { ...payload, iat: Date.now() };
  // Top-level key sort gives stable serialization since SignedTokenPayload
  // is flat. Switch to a recursive canonical serializer if any field ever
  // becomes a nested object.
  const data = Buffer.from(JSON.stringify(full, Object.keys(full).sort())).toString("base64url");
  const sig = createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token: string): SignedTokenPayload {
  const [data, sig] = token.split(".");
  if (!data || !sig) throw new BadRequestError("Invalid signed id");
  const expected = createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new BadRequestError("Invalid signed id");
  }
  let payload: SignedTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    throw new BadRequestError("Invalid signed id");
  }
  if (typeof payload.iat !== "number" || Date.now() - payload.iat > TOKEN_TTL_MS) {
    throw new BadRequestError("Signed id has expired");
  }
  return payload;
}

function buildKey(blobId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200) || "file";
  return `blobs/${blobId}/${safe}`;
}

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

// Polymorphic attachments don't cascade with their owner — when a User or Character
// is hard-deleted, call this so the sweep can reclaim their orphaned blobs.
export async function purgeAttachmentsForRecords(
  tx: Db,
  recordType: string,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return;
  await Attachments.delete(tx, { recordType, recordIds });
}

export async function urlForSlot(
  recordType: string,
  recordId: string,
  name: string,
): Promise<string | null> {
  const row = await Attachments.findOneWithBlob(db, { recordType, recordId, name });
  return row ? urlFor(row) : null;
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

async function findOrphanedBlob(
  tx: Db,
  blobId: string,
): Promise<{ id: string; key: string } | null> {
  const refs = await Attachments.findManyByBlobIds(tx, { blobIds: [blobId] });
  if (refs.length > 0) return null;
  const blob = await Blobs.findOne(tx, { id: blobId });
  if (!blob) return null;
  return { id: blob.id, key: blob.key };
}

async function purgeOrphan(orphan: { id: string; key: string } | null): Promise<void> {
  if (!orphan) return;
  try {
    await getStorage().deleteObject(orphan.key);
    await Blobs.delete(db, { id: orphan.id });
  } catch (err) {
    console.warn(
      `[attachments] S3 cleanup failed for ${orphan.key}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

const AttachmentsMethods = {
  async createDirectUpload(
    session: Session,
    params: {
      recordType: string;
      recordId: string;
      name: string;
      filename: string;
      contentType: string;
      byteSize: number;
    },
  ) {
    await assertCanAttach(session, params.recordType, params.recordId);
    assertValidName(params.recordType, params.name);
    assertWithinPolicy(params.recordType, params.byteSize, params.contentType);

    const blobId = randomUUID();
    const key = buildKey(blobId, params.filename);

    const blob = await withTransaction(async (tx: Db) => {
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

    const presignedUrl = getStorage().presignPut(key, {
      contentType: params.contentType,
    });
    const signedId = signToken({
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
  },

  async attach(session: Session, signedId: string) {
    const payload = verifyToken(signedId);
    await assertCanAttach(session, payload.recordType, payload.recordId);
    assertValidName(payload.recordType, payload.name);

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

    const stats = await getStorage().objectStats(preBlob.key);
    if (!stats) throw new BadRequestError("Upload not found at expected key");
    if (stats.size !== preBlob.byteSize) {
      throw new BadRequestError(
        `Upload size ${stats.size} does not match declared byteSize ${preBlob.byteSize}`,
      );
    }

    const result = await withTransaction(async (tx: Db) => {
      // Lock the blob row so a concurrent sweep can't delete it between
      // here and the Attachments.create below — that would surface as a
      // 23503 FK violation on insert.
      await tx.execute(sql`
        SELECT id FROM ${blobsInStorage} WHERE id = ${payload.blobId} FOR UPDATE
      `);
      const blob = await Blobs.findOne(tx, { id: payload.blobId });
      if (!blob) throw new NotFoundError("Blob not found");
      if (blob.attachedAt) throw new ConflictError("Blob is already attached");

      const existing = await Attachments.findOne(tx, {
        recordType: payload.recordType,
        recordId: payload.recordId,
        name: payload.name,
      });
      if (existing) {
        await Attachments.delete(tx, { id: existing.id });
      }

      let attachment;
      try {
        const rows = await Attachments.create(tx, {
          recordType: payload.recordType,
          recordId: payload.recordId,
          name: payload.name,
          blobId: blob.id,
        });
        attachment = rows[0];
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError("Slot is already attached by a concurrent request");
        }
        throw err;
      }
      if (!attachment) throw new InternalError("Failed to create attachment");

      const updated = await Blobs.update(
        tx,
        { attachedAt: new Date().toISOString() },
        { id: blob.id },
      );
      const attachedBlob = updated[0] ?? blob;

      const orphan = existing ? await findOrphanedBlob(tx, existing.blobId) : null;

      return { attachment, blob: attachedBlob, orphan };
    });

    await purgeOrphan(result.orphan);
    return { attachment: result.attachment, blob: result.blob };
  },

  async findOne(
    session: Session,
    params: { recordType: string; recordId: string; name: string },
  ) {
    await assertCanRead(session, params.recordType, params.recordId);
    const row = await Attachments.findOneWithBlob(db, {
      recordType: params.recordType,
      recordId: params.recordId,
      name: params.name,
    });
    if (!row) return null;
    return { id: row.id, url: urlFor(row) };
  },

  async detach(session: Session, attachmentId: string) {
    const result = await withTransaction(async (tx: Db) => {
      const attachment = await Attachments.findOne(tx, { id: attachmentId });
      if (!attachment) throw new NotFoundError("Attachment not found");
      await assertCanAttach(session, attachment.recordType, attachment.recordId);

      await Attachments.delete(tx, { id: attachment.id });
      const orphan = await findOrphanedBlob(tx, attachment.blobId);
      return { id: attachment.id, orphan };
    });

    await purgeOrphan(result.orphan);
    return { id: result.id };
  },
} as const;

class AttachmentsService extends BaseService<typeof AttachmentsMethods> {
  static initialize() {
    return new AttachmentsService(AttachmentsMethods);
  }
}

export default AttachmentsService;
