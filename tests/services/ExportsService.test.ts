import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Exports, Users } from "@/server/repositories/index.ts";
import ExportsService from "@/server/services/ExportsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("ExportsService", () => {
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
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    return { user: users[0], session: createTestSession(users[0].id) };
  }

  async function createExport(userId: string, overrides?: { expiresAt?: string }) {
    const [record] = await Exports.create(db, {
      userId,
      type: "pdf",
      mimeType: "application/pdf",
      fileName: "test-sheet.pdf",
      data: Buffer.from("fake pdf content"),
      expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    return record;
  }

  describe("download", () => {
    test("returns the export when owner requests it", async () => {
      const { session } = await createTestUser();
      const exportRecord = await createExport(session.userId);

      const result = await ExportsService.initialize().call(
        "download",
        session,
        exportRecord.id,
      );

      expect(result[0]).toBe(true);
      if (result[0]) {
        expect(result[1].id).toBe(exportRecord.id);
        expect(result[1].fileName).toBe("test-sheet.pdf");
      }
    });

    test("throws NotFoundError for mismatched user", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const exportRecord = await createExport(owner.userId);

      await expect(
        ExportsService.initialize()._methods.download(other, exportRecord.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("throws NotFoundError for non-existent export", async () => {
      const { session } = await createTestUser();
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ExportsService.initialize()._methods.download(session, fakeId),
      ).rejects.toThrow(NotFoundError);
    });

    test("throws NotFoundError for expired export", async () => {
      const { session } = await createTestUser();
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const exportRecord = await createExport(session.userId, { expiresAt: pastTime });

      await expect(
        ExportsService.initialize()._methods.download(session, exportRecord.id),
      ).rejects.toThrow("expired");
    });
  });
});
