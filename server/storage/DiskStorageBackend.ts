import { createHmac, randomUUID } from "node:crypto";
import { link, mkdir, readdir, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";

import { compareInConstantTime } from "@/server/constantTime.ts";
import { readEnv } from "@/server/environment.ts";
import { BadRequestError, ConflictError, InternalError, NotFoundError } from "@/server/errors/index.ts";

import { detectDocumentFileType, detectImageType } from "./fileTypes.ts";
import type { StorageBackend, StoredStream } from "./ObjectStorage.ts";

/** What a signed upload's link carries, which its signature covers: the type and size it may hold, and until when. */
export interface UploadGrant {
  byteSize: number;
  contentType: string;
  expires: number;
}

/** How many bytes of a file its type is read from: enough for every signature `fileTypes.ts` reads. */
const HEAD_BYTES = 16;

/**
 * A stored file's key, as `AttachmentsService.buildKey` makes it: `blobs/<its blob's id>/<its name, made safe>`. A name
 * of dots alone would step out of its folder: refused.
 */
const KEY_PATTERN = /^blobs\/[0-9a-f-]{36}\/(?!\.+$)[A-Za-z0-9._-]{1,200}$/;

/** How long a signed upload's link works, as S3's presigned links do by default here. */
const UPLOAD_LINK_TTL_SECONDS = 300;

/** The path the app serves stored files at, and takes a signed upload's bytes at. */
export const FILES_PATH = "/files";

/**
 * The folder the files are kept in: `STORAGE_PATH`'s `files`, which production sets (`findStorageKind`), `.storage` in
 * the repo otherwise.
 */
function defaultRoot() {
  return path.join(readEnv("STORAGE_PATH") || path.resolve(".storage"), "files");
}

/** Refuses a write over a file already there (`EEXIST`): a signed link used twice. */
function refuseExisting(error: unknown): never {
  if ((error as { code?: string }).code === "EEXIST") throw new ConflictError("This upload link was already used");
  throw error;
}

/** The secret uploads' links are signed with, as the upload tokens are (`AttachmentsService`). */
function signingSecret() {
  const secret = readEnv("SIGNING_SECRET");
  if (!secret) throw new InternalError("SIGNING_SECRET is not configured");
  return secret;
}

/**
 * The type a stored file's bytes say it is, and its key's name for a Word document: an image's, a PDF's, a Word
 * document's, or text, the only files the app stores.
 */
function typeOfStored(head: Uint8Array, key: string) {
  const type = detectDocumentFileType(head, key);
  return !type || type === "text/plain" ? "text/plain; charset=utf-8" : type;
}

/** Writes a body to a file as it comes, refused once it's longer than `maxBytes`. */
async function writeLimited(file: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
  const writer = Bun.file(file).writer();
  let written = 0;
  try {
    for await (const chunk of body) {
      written += chunk.byteLength;
      if (written > maxBytes)
        throw new BadRequestError(`The upload is larger than the ${maxBytes} bytes it was signed for`);
      writer.write(chunk);
    }
  } finally {
    await writer.end();
  }
}

/**
 * Files kept on the server's disk, under one folder (`root`), which the server and the worker share: what an instance
 * without S3 stores its uploads in. The app serves them at `/files/<key>` (`publicUrl`), to whoever has the key, as a
 * public bucket does; a browser's upload goes to the app too, through a link the server signs (`presignPut`).
 */
export class DiskStorageBackend implements StorageBackend {
  constructor(
    private readonly root = defaultRoot(),
    private readonly appUrl = readEnv("APP_URL") || "http://localhost:8000",
  ) {}

  /** A key's file, refused when the key isn't one the app makes, or would lead out of the folder. */
  private pathOf(key: string) {
    if (!KEY_PATTERN.test(key)) throw new NotFoundError("File not found");
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(`${path.resolve(this.root)}${path.sep}`)) throw new NotFoundError("File not found");
    return resolved;
  }

  private sign(key: string, grant: UploadGrant) {
    const data = ["upload", key, grant.contentType, grant.byteSize, grant.expires].join("\n");
    return createHmac("sha256", signingSecret()).update(data).digest("base64url");
  }

  /** Where files being written wait until they're complete: a folder no key leads to. */
  private uploadingFolder() {
    return path.join(this.root, ".uploading");
  }

  /**
   * Writes a file whole or not at all: to a temporary file in a folder no key leads to (`.uploading`, on the same disk),
   * moved in once complete. `exclusive`, it never replaces a file already there: refused (409).
   */
  private async writeAtomically(file: string, write: (temporary: string) => Promise<void>, exclusive = false) {
    await mkdir(this.uploadingFolder(), { recursive: true });
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = path.join(this.uploadingFolder(), randomUUID());
    try {
      await write(temporary);
      if (exclusive) await link(temporary, file).catch(refuseExisting);
      else await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  presignPut(key: string, opts: { byteSize?: number; contentType: string; expiresIn?: number }): string {
    this.pathOf(key);
    const grant = {
      byteSize: opts.byteSize ?? 0,
      contentType: opts.contentType,
      expires: Math.floor(Date.now() / 1000) + (opts.expiresIn ?? UPLOAD_LINK_TTL_SECONDS),
    };
    const query = new URLSearchParams({
      size: String(grant.byteSize),
      type: grant.contentType,
      expires: String(grant.expires),
      signature: this.sign(key, grant),
    });
    return `${FILES_PATH}/${key}?${query}`;
  }

  publicUrl(key: string): string {
    return `${this.appUrl.replace(/\/$/, "")}${FILES_PATH}/${key}`;
  }

  /** The grant a signed upload's link carries, refused when its signature doesn't match or it has expired. */
  verifyGrant(key: string, query: Record<string, string | undefined>): UploadGrant {
    const grant = { byteSize: Number(query.size), contentType: query.type ?? "", expires: Number(query.expires) };
    const signature = query.signature ?? "";
    if (!Number.isInteger(grant.byteSize) || !Number.isInteger(grant.expires))
      throw new BadRequestError("Invalid upload link");
    if (!compareInConstantTime(signature, this.sign(key, grant))) throw new BadRequestError("Invalid upload link");
    if (grant.expires < Date.now() / 1000) throw new BadRequestError("The upload link has expired");
    return grant;
  }

  async deleteObject(key: string): Promise<void> {
    // A key no file can be under holds nothing to delete
    const file = KEY_PATTERN.test(key) ? this.pathOf(key) : null;
    if (!file) return;
    await rm(file, { force: true });
    // Its blob's folder, emptied: one file per blob
    await rmdir(path.dirname(file)).catch(() => undefined);
  }

  async objectExists(key: string): Promise<boolean> {
    return (await this.objectStats(key)) !== null;
  }

  async objectStats(key: string): Promise<{ etag: string; size: number } | null> {
    const stats = await stat(this.pathOf(key)).catch(() => null);
    return stats?.isFile() ? { size: stats.size, etag: `${stats.size}-${Math.floor(stats.mtimeMs)}` } : null;
  }

  async putObject(key: string, data: Uint8Array): Promise<void> {
    await this.writeAtomically(this.pathOf(key), (temporary) => Bun.write(temporary, data).then(() => undefined));
  }

  /**
   * Takes a browser's upload to a link the server signed (`presignPut`), its grant verified (`verifyGrant`): the
   * `Content-Type` it was signed for, bytes that open as one of the images the app takes (as the server's own upload
   * path reads them), and no more than the size it was signed for, read as it comes, never held whole, and kept only
   * once complete, where no file is yet: a link already used is refused (409).
   */
  async receiveUpload(key: string, grant: UploadGrant, request: Request) {
    const file = this.pathOf(key);
    if (request.headers.get("content-type") !== grant.contentType)
      throw new BadRequestError("The upload's type isn't the one it was signed for");
    if (!request.body) throw new BadRequestError("The upload is empty");
    const body = request.body;
    await this.writeAtomically(
      file,
      async (temporary) => {
        await writeLimited(temporary, body, grant.byteSize);
        const head = new Uint8Array(await Bun.file(temporary).slice(0, HEAD_BYTES).arrayBuffer());
        if (!detectImageType(head)) throw new BadRequestError("The upload isn't a PNG, JPEG, WebP or GIF image");
      },
      true,
    );
  }

  /** Removes what uploads cut short left in the uploading folder (a crash mid-upload), older than `olderThanMs`. */
  async removeStaleUploads(olderThanMs: number) {
    const cutoff = Date.now() - olderThanMs;
    const names = await readdir(this.uploadingFolder()).catch(() => []);
    for (const name of names) {
      const file = path.join(this.uploadingFolder(), name);
      const stats = await stat(file).catch(() => null);
      if (stats && stats.mtimeMs < cutoff) await rm(file, { force: true });
    }
  }

  /** A stored file as the app serves it (`/files/<key>`): its bytes, type and size, or none for an unknown key. */
  async serve(key: string) {
    const stored = await this.streamObject(key);
    if (!stored) throw new NotFoundError("File not found");
    const head = new Uint8Array(await Bun.file(this.pathOf(key)).slice(0, HEAD_BYTES).arrayBuffer());
    return { ...stored, contentType: typeOfStored(head, key) };
  }

  async streamObject(key: string): Promise<StoredStream | null> {
    const stats = await this.objectStats(key);
    return stats && { size: stats.size, stream: Bun.file(this.pathOf(key)).stream() };
  }
}
