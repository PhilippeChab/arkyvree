import { createHmac, randomUUID } from "node:crypto";
import { mkdir, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";

import { compareInConstantTime } from "@/server/constantTime.ts";
import { isProduction, readEnv } from "@/server/environment.ts";
import { BadRequestError, InternalError, NotFoundError } from "@/server/errors/index.ts";

import { detectDocumentFileType, detectImageType } from "./fileTypes.ts";
import type { StorageBackend, StoredStream } from "./ObjectStorage.ts";

/** What a signed upload's link carries, which its signature covers: the type and size it may hold, and until when. */
interface UploadGrant {
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

/** The folder the files are kept in: `STORAGE_PATH`'s `files`, `/storage` in production, `.storage` in the repo else. */
function defaultRoot() {
  const base = readEnv("STORAGE_PATH") || (isProduction() ? "/storage" : path.resolve(".storage"));
  return path.join(base, "files");
}

/** The secret uploads' links are signed with, as the upload tokens are (`AttachmentsService`). */
function signingSecret() {
  const secret = readEnv("SIGNING_SECRET");
  if (!secret) throw new InternalError("SIGNING_SECRET is not configured");
  return secret;
}

/** The type a stored file's bytes say it is: an image's, a PDF's, or text, the only files the app stores. */
function typeOfStored(head: Uint8Array) {
  return detectDocumentFileType(head, "") ?? "text/plain; charset=utf-8";
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

  /**
   * Writes a file whole or not at all: to a temporary file in a folder no key leads to (`.uploading`, on the same disk),
   * renamed once complete.
   */
  private async writeAtomically(file: string, write: (temporary: string) => Promise<void>) {
    const uploading = path.join(this.root, ".uploading");
    await mkdir(uploading, { recursive: true });
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = path.join(uploading, randomUUID());
    try {
      await write(temporary);
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
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
    const file = this.pathOf(key);
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
   * Takes a browser's upload to a link the server signed (`presignPut`): its signature, its expiry, its type (the
   * `Content-Type` it was signed for, which its bytes must open with: an image), and its size (no more than it was
   * signed for), read as it comes, never held whole, and kept only once complete.
   */
  async receiveUpload(key: string, query: Record<string, string | undefined>, request: Request) {
    const file = this.pathOf(key);
    const grant = this.verifyGrant(key, query);
    if (request.headers.get("content-type") !== grant.contentType)
      throw new BadRequestError("The upload's type isn't the one it was signed for");
    if (!request.body) throw new BadRequestError("The upload is empty");
    await this.writeAtomically(file, async (temporary) => {
      await writeLimited(temporary, request.body!, grant.byteSize);
      const head = new Uint8Array(await Bun.file(temporary).slice(0, HEAD_BYTES).arrayBuffer());
      if (detectImageType(head) !== grant.contentType)
        throw new BadRequestError("The upload's bytes aren't the type it was signed for");
    });
  }

  /** A stored file as the app serves it (`/files/<key>`): its bytes, type and size, or none for an unknown key. */
  async serve(key: string) {
    const stored = await this.streamObject(key);
    if (!stored) throw new NotFoundError("File not found");
    const head = new Uint8Array(await Bun.file(this.pathOf(key)).slice(0, HEAD_BYTES).arrayBuffer());
    return { ...stored, contentType: typeOfStored(head) };
  }

  async streamObject(key: string): Promise<StoredStream | null> {
    const stats = await this.objectStats(key);
    return stats && { size: stats.size, stream: Bun.file(this.pathOf(key)).stream() };
  }
}
