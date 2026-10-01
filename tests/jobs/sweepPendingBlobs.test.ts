import { beforeEach, describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { sweepPendingBlobs } from "@/server/jobs/sweepPendingBlobs.ts";
import { Attachments, Blobs } from "@/server/repositories/index.ts";
import { setStorageForTest } from "@/server/storage/s3.ts";
import { createTestUser } from "@/tests/helpers.ts";
import { fakeStorage } from "@/tests/storage.ts";

const DAY = 24 * 60 * 60 * 1000;

describe("sweepPendingBlobs", () => {
  let deleted: string[];

  beforeEach(() => {
    deleted = [];
    setStorageForTest(
      fakeStorage({
        async deleteObject(key) {
          deleted.push(key);
        },
      }),
    );
  });

  /** A blob no attachment references, uploaded `ageMs` ago. */
  async function createPendingBlob(filename: string, ageMs = 0) {
    const [blob] = await Blobs.create(db, {
      key: `blobs/${crypto.randomUUID()}/${filename}`,
      filename,
      contentType: "image/png",
      byteSize: 100,
    });
    if (ageMs) await Blobs.update(db, { createdAt: new Date(Date.now() - ageMs).toISOString() }, { id: blob.id });
    return blob;
  }

  const rowOf = (id: string) => db.query.blobsInStorage.findFirst({ where: (t, { eq }) => eq(t.id, id) });

  test("deletes pending blobs (S3 object and row) older than the TTL", async () => {
    const oldBlob = await createPendingBlob("old.png", 2 * DAY);
    const recentBlob = await createPendingBlob("recent.png");

    expect(await sweepPendingBlobs({ ttlMs: DAY })).toMatchObject({ swept: 1, failed: 0 });
    expect(deleted).toEqual([oldBlob.key]);
    expect(await rowOf(oldBlob.id)).toBeUndefined();
    expect(await rowOf(recentBlob.id)).toBeDefined();
  });

  test("keeps attached blobs, however old", async () => {
    const { user } = await createTestUser();
    const blob = await createPendingBlob("kept.png", 2 * DAY);
    await Blobs.update(db, { attachedAt: new Date().toISOString() }, { id: blob.id });
    await Attachments.create(db, { recordType: "User", recordId: user.id, name: "avatar", blobId: blob.id });

    expect(await sweepPendingBlobs({ ttlMs: DAY })).toMatchObject({ swept: 0 });
    expect(deleted).toEqual([]);
    expect(await Blobs.findOne(db, { id: blob.id })).toBeDefined();
  });

  test("cleans up orphans: attached once, but no attachment references them any more", async () => {
    // The state a detach leaves behind when its inline S3 cleanup failed.
    const blob = await createPendingBlob("orphaned.png");
    await Blobs.update(db, { attachedAt: new Date().toISOString() }, { id: blob.id });

    expect(await sweepPendingBlobs({ ttlMs: DAY })).toMatchObject({ swept: 1 });
    expect(deleted).toContain(blob.key);
    expect(await rowOf(blob.id)).toBeUndefined();
  });

  test("keeps the row when the S3 delete fails, so the next sweep retries", async () => {
    setStorageForTest(
      fakeStorage({
        async deleteObject() {
          throw new Error("simulated S3 failure");
        },
      }),
    );
    const blob = await createPendingBlob("doomed.png", 2 * DAY);

    expect(await sweepPendingBlobs({ ttlMs: DAY })).toMatchObject({ swept: 0, failed: 1 });
    expect(await rowOf(blob.id)).toBeDefined();
  });
});
