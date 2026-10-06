import { readEnv } from "@/server/environment.ts";
import { InternalError } from "@/server/errors/index.ts";

export interface StorageBackend {
  presignPut(key: string, opts: { contentType: string; expiresIn?: number }): string;
  publicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  /** Returns object metadata or `null` if the object does not exist. */
  objectStats(key: string): Promise<{ size: number; etag: string } | null>;
}

/**
 * 5-minute cooldown so a credentials rotation that breaks the backend re-warns instead of staying silent forever after
 * the first miss.
 */
const PUBLIC_URL_WARN_COOLDOWN_MS = 5 * 60 * 1000;

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; status?: number; statusCode?: number };
  return e.code === "NoSuchKey" || e.status === 404 || e.statusCode === 404;
}

export function isStorageConfigured(): boolean {
  return Boolean(
    readEnv("S3_BUCKET") &&
    readEnv("S3_ENDPOINT") &&
    readEnv("S3_ACCESS_KEY_ID") &&
    readEnv("S3_SECRET_ACCESS_KEY") &&
    readEnv("S3_PUBLIC_URL"),
  );
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

  async objectStats(key: string): Promise<{ size: number; etag: string } | null> {
    try {
      const stats = await Bun.s3.stat(key);
      return { size: stats.size, etag: stats.etag };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}

/** The object storage the server uploads attachments to: S3 (`S3StorageBackend`), built on first use, or a test's. */
class ObjectStorage {
  private backend: StorageBackend | null = null;

  private publicUrlLastWarnedAt = 0;

  /** The public URL of a stored object, or null (warned at most every 5 minutes) when storage isn't configured. */
  findPublicUrl(key: string): string | null {
    try {
      return this.get().publicUrl(key);
    } catch (err) {
      const now = Date.now();
      if (now - this.publicUrlLastWarnedAt > PUBLIC_URL_WARN_COOLDOWN_MS) {
        this.publicUrlLastWarnedAt = now;
        console.warn(
          `[attachments] getPublicUrl() returning null — storage not configured: ${err instanceof Error ? err.message : err}`,
        );
      }
      return null;
    }
  }

  get(): StorageBackend {
    this.backend ??= new S3StorageBackend();
    return this.backend;
  }

  setForTest(backend: StorageBackend | null): void {
    this.backend = backend;
  }
}

export default new ObjectStorage();
