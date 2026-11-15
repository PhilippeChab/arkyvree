import { type EnvironmentVariable, readEnv } from "@/server/environment.ts";
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
  /** Stores an object the server holds whole: a file uploaded through it rather than straight to the storage. */
  putObject(key: string, data: Uint8Array, opts: { contentType: string }): Promise<void>;
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

/**
 * 5-minute cooldown so a credentials rotation that breaks the backend re-warns instead of staying silent forever after
 * the first miss.
 */
const PUBLIC_URL_WARN_COOLDOWN_MS = 5 * 60 * 1000;

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

/** Stops a start whose S3 variables are set in part (`findStorageKind`), naming those missing. */
export function checkStorageConfiguration(processName: string) {
  if (findStorageKind()) return;
  const missing = S3_VARIABLES.filter((name) => !readEnv(name));
  console.error(
    `[${processName}] S3 storage is set up in part: set ${missing.join(", ")} too, or none of the S3 variables to keep files on disk`,
  );
  process.exit(1);
}

/**
 * Where the files go: `s3` with every S3 variable set, `disk` with none. Some set and others not is a mistake the
 * server and the worker refuse to start with (`checkStorageConfiguration`), rather than keep files where nobody looks.
 */
export function findStorageKind(): "disk" | "s3" | null {
  const set = S3_VARIABLES.filter((name) => readEnv(name));
  if (set.length === S3_VARIABLES.length) return "s3";
  return set.length === 0 ? "disk" : null;
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

  async putObject(key: string, data: Uint8Array, opts: { contentType: string }): Promise<void> {
    await Bun.s3.write(key, data, { type: opts.contentType });
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
    if (!kind) throw new InternalError("S3 storage is set up in part");
    this.backend = kind === "s3" ? new S3StorageBackend() : new DiskStorageBackend();
    return this.backend;
  }

  setForTest(backend: StorageBackend | null): void {
    this.backend = backend;
  }
}

export default new ObjectStorage();
