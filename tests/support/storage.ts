import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DiskStorageBackend } from "@/server/storage/DiskStorageBackend.ts";
import type { StorageBackend, StoredStream } from "@/server/storage/ObjectStorage.ts";

/**
 * A disk storage in a folder of its own, made for the test (`root`, under the system's temporary folder), and what
 * removes it: `ObjectStorage.setForTest(storage)` to run a test's attachments on it.
 */
export function diskStorage() {
  const root = mkdtempSync(path.join(tmpdir(), "arkyvree-files-"));
  const storage = new DiskStorageBackend(root, "https://app.example.com");
  return { root, storage, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * An in-memory storage backend: every object exists and reports 1 KiB, and reads as none.
 * `tests/setup.ts` installs one before each test; pass `overrides` to
 * `ObjectStorage.setForTest(fakeStorage({ ... }))` to observe or fail calls.
 */
export function fakeStorage(overrides: Partial<StorageBackend> = {}): StorageBackend {
  return {
    presignPut: (key) => `https://fake.example.com/${key}?sig=fake`,
    publicUrl: (key) => `https://fake.example.com/${key}`,
    async deleteObject() {},
    async putObject() {},
    async objectExists() {
      return true;
    },
    async objectStats() {
      return { size: 1024, etag: "fake" };
    },
    async streamObject() {
      return null;
    },
    ...overrides,
  };
}

/** An object's read, as the storage answers it, of bytes a test holds (`data`), none without them. */
export function streamOf(data: Uint8Array | undefined): StoredStream | null {
  if (!data) return null;
  return { size: data.byteLength, stream: new Response(new Uint8Array(data)).body! };
}
