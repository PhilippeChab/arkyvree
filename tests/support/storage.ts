import type { StorageBackend } from "@/server/storage/s3.ts";

/**
 * An in-memory storage backend: every object exists and reports 1 KiB.
 * `tests/setup.ts` installs one before each test; pass `overrides` to
 * `ObjectStorage.setForTest(fakeStorage({ ... }))` to observe or fail calls.
 */
export function fakeStorage(overrides: Partial<StorageBackend> = {}): StorageBackend {
  return {
    presignPut: (key) => `https://fake.example.com/${key}?sig=fake`,
    publicUrl: (key) => `https://fake.example.com/${key}`,
    async deleteObject() {},
    async objectExists() {
      return true;
    },
    async objectStats() {
      return { size: 1024, etag: "fake" };
    },
    ...overrides,
  };
}
