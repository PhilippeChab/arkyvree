import { type EnvironmentVariable, isProduction, readEnv } from "@/server/environment.ts";
import { InternalError } from "@/server/errors/index.ts";

import { DiskStorageBackend } from "./DiskStorageBackend.ts";

export interface StorageBackend {
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  /** Returns object metadata or `null` if the object does not exist. */
  objectStats(key: string): Promise<{ etag: string; size: number } | null>;
  /** A link a browser uploads one file to (`PUT`), of its type (`contentType`) and at most its size (`byteSize`). */
  presignPut(key: string, opts: { byteSize?: number; contentType: string; expiresIn?: number }): string;
  publicUrl(key: string): string;
  /**
   * Stores an object as its bytes come (`body`), never held whole: a file uploaded through the server rather than
   * straight to the storage. A body that fails as it's read (a file refused midway) stores nothing.
   */
  putObject(key: string, body: StoredBody, opts: { contentType: string }): Promise<void>;
  /**
   * An object's bytes as they come from the storage, with how many there are, or `null` when there's none: the server
   * hands a private file on as it reads it, never holding it whole.
   */
  streamObject(key: string): Promise<StoredStream | null>;
}

/** An object being read: its bytes as they come, and how many there are in all. */
export interface StoredStream {
  size: number;
  stream: ReadableStream<Uint8Array>;
}

/** An object's bytes as they're stored: chunks as they come (a request's body), or a few the server holds. */
export type StoredBody = AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

/**
 * 5-minute cooldown so a credentials rotation that breaks the backend re-warns instead of staying silent forever after
 * the first miss.
 */
const PUBLIC_URL_WARN_COOLDOWN_MS = 5 * 60 * 1000;

/** The size of each part an upload streams to S3 in: S3's smallest. */
const S3_PART_BYTES = 5 * 1024 * 1024;

/** The variables S3 storage reads: all set, the files go to the bucket; none, to the server's disk. */
const S3_VARIABLES = [
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_URL",
] as const satisfies EnvironmentVariable[];

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; status?: number; statusCode?: number };
  return e.code === "NoSuchKey" || e.status === 404 || e.statusCode === 404;
}

/**
 * A body as a stream, read as it's pulled: one that fails as it's read fails the stream with its error, which aborts
 * what S3 was storing (a multipart upload's parts, a plain upload's request) rather than complete it.
 */
function toStream(body: StoredBody) {
  const chunks = Symbol.asyncIterator in body ? body[Symbol.asyncIterator]() : body[Symbol.iterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await chunks.return?.();
    },
  });
}

/** Stops a start with no storage it can use (`findStorageKind`), saying what to set. */
export function checkStorageConfiguration(processName: string) {
  if (findStorageKind()) return;
  const missing = S3_VARIABLES.filter((name) => !readEnv(name));
  console.error(
    missing.length < S3_VARIABLES.length
      ? `[${processName}] S3 storage is set up in part: set ${missing.join(", ")} too, or none of the S3 variables to keep files on disk`
      : `[${processName}] No file storage is set up: set the five S3 variables, or STORAGE_PATH to keep files on disk`,
  );
  process.exit(1);
}

/**
 * Where the files go: `s3` with every S3 variable set, `disk` with none. Some set and others not is a mistake the
 * server and the worker refuse to start with (`checkStorageConfiguration`), rather than keep files where nobody looks;
 * so is production with none of them and no `STORAGE_PATH`, which would keep the files on a disk nobody chose (on Fly, a
 * machine's own, lost with it).
 */
export function findStorageKind(): "disk" | "s3" | null {
  const set = S3_VARIABLES.filter((name) => readEnv(name));
  if (set.length === S3_VARIABLES.length) return "s3";
  if (set.length > 0) return null;
  return isProduction() && !readEnv("STORAGE_PATH") ? null : "disk";
}

class S3StorageBackend implements StorageBackend {
  presignPut(key: string, opts: { contentType: string; expiresIn?: number }): string {
    return Bun.s3.presign(key, {
      method: "PUT",
      expiresIn: opts.expiresIn ?? 300,
      type: opts.contentType,
    });
  }

  publicUrl(key: string): string {
    const base = readEnv("S3_PUBLIC_URL");
    if (!base) throw new InternalError("S3_PUBLIC_URL is not configured");
    return `${base.replace(/\/$/, "")}/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    await Bun.s3.delete(key);
  }

  async objectExists(key: string): Promise<boolean> {
    return await Bun.s3.exists(key);
  }

  async objectStats(key: string): Promise<{ etag: string; size: number } | null> {
    try {
      const stats = await Bun.s3.stat(key);
      return { size: stats.size, etag: stats.etag };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /**
   * Streams a body to the bucket in parts (`S3_PART_BYTES`), one in flight at a time, so an upload holds a part or two,
   * never the file whole; a body that fails as it's read aborts the upload, storing nothing.
   */
  async putObject(key: string, body: StoredBody, opts: { contentType: string }): Promise<void> {
    await Bun.s3.write(key, new Response(toStream(body)), {
      type: opts.contentType,
      partSize: S3_PART_BYTES,
      queueSize: 1,
    });
  }

  async streamObject(key: string): Promise<StoredStream | null> {
    // Its size first, which also says whether it's there: a stream only fails once it's read
    const stats = await this.objectStats(key);
    return stats && { size: stats.size, stream: Bun.s3.file(key).stream() };
  }
}

/**
 * The object storage the server uploads attachments to: S3 (`S3StorageBackend`) or the server's disk
 * (`DiskStorageBackend`), as the environment sets it (`findStorageKind`), built on first use, or a test's.
 */
class ObjectStorage {
  private backend: StorageBackend | null = null;

  private publicUrlLastWarnedAt = 0;

  /** The disk storage, when the files are kept on the server's disk: none with S3, whose bucket serves them. */
  findDisk(): DiskStorageBackend | null {
    const backend = this.get();
    return backend instanceof DiskStorageBackend ? backend : null;
  }

  /** The public URL of a stored object, or null (warned at most every 5 minutes) when storage isn't configured. */
  findPublicUrl(key: string): string | null {
    try {
      return this.get().publicUrl(key);
    } catch (error) {
      const now = Date.now();
      if (now - this.publicUrlLastWarnedAt > PUBLIC_URL_WARN_COOLDOWN_MS) {
        this.publicUrlLastWarnedAt = now;
        console.warn(
          `[attachments] findPublicUrl() returning null — storage not configured: ${error instanceof Error ? error.message : error}`,
        );
      }
      return null;
    }
  }

  get(): StorageBackend {
    if (this.backend) return this.backend;
    const kind = findStorageKind();
    if (!kind) throw new InternalError("No file storage is set up (checkStorageConfiguration)");
    this.backend = kind === "s3" ? new S3StorageBackend() : new DiskStorageBackend();
    return this.backend;
  }

  setForTest(backend: StorageBackend | null): void {
    this.backend = backend;
  }
}

export default new ObjectStorage();
