import { InternalError } from "@/server/errors/index.ts";

export interface StorageBackend {
  presignPut(
    key: string,
    opts: { contentType: string; expiresIn?: number },
  ): string;
  publicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  /** Returns object metadata or `null` if the object does not exist. */
  objectStats(key: string): Promise<{ size: number; etag: string } | null>;
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_PUBLIC_URL,
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
    const base = process.env.S3_PUBLIC_URL;
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

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; status?: number; statusCode?: number };
  return e.code === "NoSuchKey" || e.status === 404 || e.statusCode === 404;
}

let _storage: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (_storage) return _storage;
  _storage = new S3StorageBackend();
  return _storage;
}

export function setStorageForTest(backend: StorageBackend | null): void {
  _storage = backend;
}
