import { createHmac } from "node:crypto";

import { getSeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/server/errors/index.ts";
import { Attachments, Blobs, Characters, Users } from "@/server/repositories/index.ts";
import AttachmentsService from "@/server/services/AttachmentsService.ts";
import { setStorageForTest, type StorageBackend } from "@/server/storage/s3.ts";
import type { Session } from "@/shared/relations.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// Replicates the service's HMAC signing so tests can craft tokens with
// arbitrary `iat` values (e.g. expired) without exposing internals.
function signTestToken(payload: Record<string, unknown>): string {
  const data = Buffer.from(JSON.stringify(payload, Object.keys(payload).sort())).toString("base64url");
  const sig = createHmac("sha256", process.env.SIGNING_SECRET!)
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

describe("AttachmentsService", () => {
  let presignCalls: Array<{ key: string; contentType: string }>;
  let stats: Map<string, { size: number; etag: string } | null>;
  let deletedKeys: string[];
  let deleteShouldFail: boolean;

  beforeEach(() => {
    presignCalls = [];
    stats = new Map();
    deletedKeys = [];
    deleteShouldFail = false;
    const fake: StorageBackend = {
      presignPut(key, opts) {
        presignCalls.push({ key, ...opts });
        return `https://fake.example.com/test-bucket/${key}?sig=fake`;
      },
      publicUrl(key) {
        return `https://fake.example.com/test-bucket/${key}`;
      },
      async deleteObject(key) {
        if (deleteShouldFail) throw new Error("simulated S3 failure");
        deletedKeys.push(key);
      },
      async objectExists() {
        return true;
      },
      async objectStats(key) {
        if (stats.has(key)) return stats.get(key)!;
        // Default: simulate a successful upload by reporting the blob's recorded byteSize.
        const blob = await db.query.blobsInStorage.findFirst({
          where: (t, { eq }) => eq(t.key, key),
        });
        return blob ? { size: blob.byteSize, etag: "fake-etag" } : null;
      },
    };
    setStorageForTest(fake);
  });

  afterEach(() => {
    setStorageForTest(null);
  });

  function createTestSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const users = await Users.create(db, {
      username: `attachuser-${uniqueId}`,
      emailAddress: `attach-${uniqueId}@example.com`,
      password: "password1234",
    });
    return { user: users[0], session: createTestSession(users[0].id) };
  }

  async function createTestCharacter(userId: string) {
    const ctx = await getSeedContext(db);
    const characters = await Characters.create(db, {
      userId,
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      name: `attach-char-${Math.random().toString(36).slice(2, 9)}`,
      xp: 0,
      alignment: "Lawful Good",
      gender: "Male",
    });
    return characters[0];
  }

  function uploadParams(
    userId: string,
    overrides?: Partial<{ name: string; filename: string; contentType: string; byteSize: number }>,
  ) {
    return {
      recordType: "User",
      recordId: userId,
      name: overrides?.name ?? "avatar",
      filename: overrides?.filename ?? "me.png",
      contentType: overrides?.contentType ?? "image/png",
      byteSize: overrides?.byteSize ?? 12345,
    };
  }

  describe("createDirectUpload", () => {
    test("creates a pending blob (attached_at null) and returns a presigned URL + signed id", async () => {
      const { session } = await createTestUser();

      const result = await AttachmentsService.initialize().call(
        "createDirectUpload",
        session,
        uploadParams(session.userId),
      );

      expect(result[0]).toBe(true);
      if (!result[0]) return;
      const { signedId, presignedUrl, headers } = result[1];

      expect(signedId).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(presignedUrl).toContain("https://fake.example.com/test-bucket/blobs/");
      expect(headers["Content-Type"]).toBe("image/png");

      expect(presignCalls).toHaveLength(1);
      expect(presignCalls[0].contentType).toBe("image/png");

      const blob = await Blobs.findOne(db, { key: presignCalls[0].key });
      expect(blob).toBeDefined();
      expect(blob?.filename).toBe("me.png");
      expect(blob?.byteSize).toBe(12345);
      expect(blob?.attachedAt).toBeNull();
    });

    test("rejects when session does not own the target user", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();

      await expect(
        AttachmentsService.initialize()._methods.createDirectUpload(
          other,
          uploadParams(owner.userId),
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    test("rejects unknown record types", async () => {
      const { session } = await createTestUser();
      await expect(
        AttachmentsService.initialize()._methods.createDirectUpload(session, {
          ...uploadParams(session.userId),
          recordType: "Mystery",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    test("rejects uploads exceeding the per-type maxBytes", async () => {
      const { session } = await createTestUser();
      await expect(
        AttachmentsService.initialize()._methods.createDirectUpload(session, {
          ...uploadParams(session.userId),
          byteSize: 10 * 1024 * 1024, // 10 MB > 5 MB cap for User
        }),
      ).rejects.toThrow(/exceeds maximum size/);
    });

    test("rejects uploads with disallowed contentType", async () => {
      const { session } = await createTestUser();
      await expect(
        AttachmentsService.initialize()._methods.createDirectUpload(session, {
          ...uploadParams(session.userId),
          contentType: "application/pdf",
        }),
      ).rejects.toThrow(/not allowed/);
    });

    test("Character: owner can request a direct upload", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session.userId);

      const result = await AttachmentsService.initialize().call(
        "createDirectUpload",
        session,
        {
          recordType: "Character",
          recordId: character.id,
          name: "portrait",
          filename: "char.png",
          contentType: "image/png",
          byteSize: 2048,
        },
      );
      expect(result[0]).toBe(true);
    });

    test("Character: non-owner is forbidden", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const character = await createTestCharacter(owner.userId);

      await expect(
        AttachmentsService.initialize()._methods.createDirectUpload(other, {
          recordType: "Character",
          recordId: character.id,
          name: "portrait",
          filename: "char.png",
          contentType: "image/png",
          byteSize: 2048,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    test("Character: non-existent record is forbidden", async () => {
      const { session } = await createTestUser();
      await expect(
        AttachmentsService.initialize()._methods.createDirectUpload(session, {
          recordType: "Character",
          recordId: "00000000-0000-0000-0000-000000000000",
          name: "portrait",
          filename: "char.png",
          contentType: "image/png",
          byteSize: 2048,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("attach", () => {
    test("creates an attachment, sets attached_at, returns blob + attachment", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );

      const result = await AttachmentsService.initialize().call("attach", session, direct.signedId);
      expect(result[0]).toBe(true);
      if (!result[0]) return;

      const live = await Attachments.findOne(db, {
        recordType: "User",
        recordId: session.userId,
        name: "avatar",
      });
      expect(live).toBeDefined();
      expect(live?.blobId).toBe(result[1].blob.id);

      const blob = await Blobs.findOne(db, { id: result[1].blob.id });
      expect(blob?.attachedAt).not.toBeNull();
    });

    test("replaces existing attachment AND archives the displaced blob", async () => {
      const { session } = await createTestUser();

      const first = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId, { filename: "old.png" }),
      );
      const firstAttach = await AttachmentsService.initialize()._methods.attach(
        session,
        first.signedId,
      );

      const second = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId, { filename: "new.png" }),
      );
      const replaced = await AttachmentsService.initialize()._methods.attach(
        session,
        second.signedId,
      );

      expect(replaced.attachment.id).not.toBe(firstAttach.attachment.id);
      expect(replaced.blob.filename).toBe("new.png");

      // Old blob is archived (no longer findable through the live filter).
      const oldBlob = await Blobs.findOne(db, { id: firstAttach.blob.id });
      expect(oldBlob).toBeUndefined();

      // New blob is alive.
      const newBlob = await Blobs.findOne(db, { id: replaced.blob.id });
      expect(newBlob).toBeDefined();
    });

    test("rejects attach when no object exists at the expected key", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );

      const key = presignCalls[0].key;
      stats.set(key, null);

      await expect(
        AttachmentsService.initialize()._methods.attach(session, direct.signedId),
      ).rejects.toThrow(/Upload not found/);
    });

    test("rejects attach when uploaded size does not match declared byteSize", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId, { byteSize: 1000 }),
      );

      const key = presignCalls[0].key;
      stats.set(key, { size: 9999, etag: "wrong" });

      await expect(
        AttachmentsService.initialize()._methods.attach(session, direct.signedId),
      ).rejects.toThrow(/does not match declared byteSize/);
    });

    test("rejects a tampered signed id", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );
      const [data] = direct.signedId.split(".");
      const tampered = `${data}.AAAA`;

      await expect(
        AttachmentsService.initialize()._methods.attach(session, tampered),
      ).rejects.toThrow(BadRequestError);
    });

    test("rejects when caller no longer owns the target", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        owner,
        uploadParams(owner.userId),
      );

      await expect(
        AttachmentsService.initialize()._methods.attach(other, direct.signedId),
      ).rejects.toThrow(ForbiddenError);
    });

    test("rejects an expired signed id", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );
      const blob = await Blobs.findOne(db, { key: presignCalls[0].key });
      const expired = signTestToken({
        blobId: blob!.id,
        recordType: "User",
        recordId: session.userId,
        name: "avatar",
        iat: Date.now() - 25 * 60 * 60 * 1000, // 25h ago
      });

      await expect(
        AttachmentsService.initialize()._methods.attach(session, expired),
      ).rejects.toThrow(/expired/);

      // The direct-upload's own (fresh) signedId still works.
      const fresh = await AttachmentsService.initialize()._methods.attach(
        session,
        direct.signedId,
      );
      expect(fresh.attachment).toBeDefined();
    });
  });

  describe("findOne", () => {
    test("returns null when no live attachment exists in the slot", async () => {
      const { session } = await createTestUser();
      const result = await AttachmentsService.initialize()._methods.findOne(session, {
        recordType: "User",
        recordId: session.userId,
        name: "avatar",
      });
      expect(result).toBeNull();
    });

    test("returns attachment + blob + url when one exists", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );
      await AttachmentsService.initialize()._methods.attach(session, direct.signedId);

      const result = await AttachmentsService.initialize()._methods.findOne(session, {
        recordType: "User",
        recordId: session.userId,
        name: "avatar",
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBeDefined();
      expect(result!.url).toContain("https://fake.example.com");
    });
  });

  describe("detach", () => {
    test("removes attachment + blob row + S3 object when no other attachment references it", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );
      const { attachment, blob } = await AttachmentsService.initialize()._methods.attach(
        session,
        direct.signedId,
      );

      await AttachmentsService.initialize()._methods.detach(session, attachment.id);

      // S3 object actually deleted.
      expect(deletedKeys).toContain(blob.key);
      // Blob row hard-deleted (FK cascade also wipes attachment rows).
      const blobRow = await Blobs.findOne(db, { id: blob.id });
      expect(blobRow).toBeUndefined();
    });

    test("leaves blob row in place when S3 delete fails — sweep retries via no-live-refs", async () => {
      const { session } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        session,
        uploadParams(session.userId),
      );
      const { attachment, blob } = await AttachmentsService.initialize()._methods.attach(
        session,
        direct.signedId,
      );

      deleteShouldFail = true;
      await AttachmentsService.initialize()._methods.detach(session, attachment.id);

      // Attachment row hard-deleted (no live attachment for the slot).
      const live = await Attachments.findOne(db, {
        recordType: "User",
        recordId: session.userId,
        name: "avatar",
      });
      expect(live).toBeUndefined();

      // Blob row stays — sweep will find it via "no live refs" and retry S3.
      const blobRow = await db.query.blobsInStorage.findFirst({
        where: (t, { eq }) => eq(t.id, blob.id),
      });
      expect(blobRow).toBeDefined();
      expect(blobRow?.attachedAt).not.toBeNull();
    });

    test("throws NotFoundError for an unknown attachment id", async () => {
      const { session } = await createTestUser();
      await expect(
        AttachmentsService.initialize()._methods.detach(
          session,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("rejects detach when caller does not own the target", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const direct = await AttachmentsService.initialize()._methods.createDirectUpload(
        owner,
        uploadParams(owner.userId),
      );
      const { attachment } = await AttachmentsService.initialize()._methods.attach(
        owner,
        direct.signedId,
      );

      await expect(
        AttachmentsService.initialize()._methods.detach(other, attachment.id),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
