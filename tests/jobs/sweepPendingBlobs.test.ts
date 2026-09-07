import { db } from "@/server/database/index.ts";
import { sweepPendingBlobs } from "@/server/jobs/sweepPendingBlobs.ts";
import { Attachments, Blobs, Users } from "@/server/repositories/index.ts";
import { setStorageForTest, type StorageBackend } from "@/server/storage/s3.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

describe("sweepPendingBlobs", () => {
  let deleted: string[];

  beforeEach(() => {
    deleted = [];
    const fake: StorageBackend = {
      presignPut: () => "https://fake/url",
      publicUrl: (k) => `https://fake/${k}`,
      async deleteObject(key) {
        deleted.push(key);
      },
      async objectExists() {
        return false;
      },
      async objectStats() {
        return null;
      },
    };
    setStorageForTest(fake);
  });

  afterEach(() => {
    setStorageForTest(null);
  });

  async function createUser() {
    const uniqueId = Math.random().toString(36).slice(2, 9);
    const users = await Users.create(db, {
      username: `sweepuser-${uniqueId}`,
      emailAddress: `sweep-${uniqueId}@example.com`,
      password: "password1234",
    });
    return users[0];
  }

  async function createPendingBlob(filename: string) {
    const rows = await Blobs.create(db, {
      key: `blobs/${crypto.randomUUID()}/${filename}`,
      filename,
      contentType: "image/png",
      byteSize: 100,
    });
    return rows[0];
  }

  async function createAttachedBlob(filename: string, recordId: string) {
    const blob = await createPendingBlob(filename);
    await Blobs.update(db, { attachedAt: new Date().toISOString() }, { id: blob.id });
    await Attachments.create(db, {
      recordType: "User",
      recordId,
      name: "avatar",
      blobId: blob.id,
    });
    return blob;
  }

  test("deletes pending blobs (S3 + DB row) older than the TTL", async () => {
    const oldBlob = await createPendingBlob("old.png");
    await Blobs.update(
      db,
      { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
      { id: oldBlob.id },
    );
    const recentBlob = await createPendingBlob("recent.png");

    const result = await sweepPendingBlobs({ ttlMs: 24 * 60 * 60 * 1000 });

    expect(result.swept).toBe(1);
    expect(result.failed).toBe(0);
    expect(deleted).toEqual([oldBlob.key]);

    // Old blob row hard-deleted; recent one still there.
    const oldRow = await db.query.blobsInStorage.findFirst({
      where: (t, { eq }) => eq(t.id, oldBlob.id),
    });
    const recentRow = await db.query.blobsInStorage.findFirst({
      where: (t, { eq }) => eq(t.id, recentBlob.id),
    });
    expect(oldRow).toBeUndefined();
    expect(recentRow).toBeDefined();
  });

  test("skips attached blobs even when older than the TTL", async () => {
    const user = await createUser();
    const attached = await createAttachedBlob("kept.png", user.id);
    await Blobs.update(
      db,
      { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
      { id: attached.id },
    );

    const result = await sweepPendingBlobs({ ttlMs: 24 * 60 * 60 * 1000 });

    expect(result.swept).toBe(0);
    expect(deleted).toEqual([]);
    const stillLive = await Blobs.findOne(db, { id: attached.id });
    expect(stillLive).toBeDefined();
  });

  test("cleans up orphans (attached_at set but no live attachment refs)", async () => {
    const blob = await createPendingBlob("orphaned.png");
    // Simulates the state left by a detach whose inline S3 cleanup failed:
    // attached_at is set but no attachment row references the blob.
    await Blobs.update(db, { attachedAt: new Date().toISOString() }, { id: blob.id });

    const result = await sweepPendingBlobs({ ttlMs: 24 * 60 * 60 * 1000 });

    expect(result.swept).toBe(1);
    expect(deleted).toContain(blob.key);
    const row = await db.query.blobsInStorage.findFirst({
      where: (t, { eq }) => eq(t.id, blob.id),
    });
    expect(row).toBeUndefined();
  });

  test("leaves the row alone when S3 delete throws — sweep retries next pass", async () => {
    setStorageForTest({
      presignPut: () => "https://fake/url",
      publicUrl: (k) => `https://fake/${k}`,
      async deleteObject() {
        throw new Error("simulated S3 failure");
      },
      async objectExists() {
        return false;
      },
      async objectStats() {
        return null;
      },
    });

    const blob = await createPendingBlob("doomed.png");
    await Blobs.update(
      db,
      { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
      { id: blob.id },
    );

    const result = await sweepPendingBlobs({ ttlMs: 24 * 60 * 60 * 1000 });
    expect(result.swept).toBe(0);
    expect(result.failed).toBe(1);

    // Row still physically there so next sweep can retry.
    const row = await db.query.blobsInStorage.findFirst({
      where: (t, { eq }) => eq(t.id, blob.id),
    });
    expect(row).toBeDefined();
  });
});
