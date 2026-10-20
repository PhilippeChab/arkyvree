import { describe, expect, test } from "bun:test";

import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { ExportsService } from "@/server/services/exports/index.ts";
import { createExport } from "@/tests/support/files.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("ExportsService.getExport", () => {
  test("returns the owner's export", async () => {
    const { session } = await createTestUser();
    const { id } = await createExport(session.userId);
    expect(await ExportsService.getExport(session, id)).toMatchObject({ id, fileName: "test-sheet.pdf" });
  });

  test("hides another user's export", async () => {
    const { session: owner } = await createTestUser();
    const { session: other } = await createTestUser();
    const { id } = await createExport(owner.userId);
    expect(ExportsService.getExport(other, id)).rejects.toThrow(NotFoundError);
  });

  test("throws NotFoundError for a missing or expired export", async () => {
    const { session } = await createTestUser();
    expect(ExportsService.getExport(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    const expired = await createExport(session.userId, new Date(Date.now() - 1000).toISOString());
    expect(ExportsService.getExport(session, expired.id)).rejects.toThrow("expired");
  });
});

describe("ExportsService.getExport, of an export that has no file yet", () => {
  test("refuses a pending export, and a failed one", async () => {
    const { session } = await createTestUser();
    const pending = await createExport(session.userId, undefined, "pending");
    expect(ExportsService.getExport(session, pending.id)).rejects.toThrow(ConflictError);
    const failed = await createExport(session.userId, undefined, "failed");
    expect(ExportsService.getExport(session, failed.id)).rejects.toThrow("failed");
  });
});

describe("ExportsService.getExportStatus", () => {
  test("answers where the owner's export stands, without its file", async () => {
    const { session } = await createTestUser();
    for (const status of ["pending", "ready", "failed"] as const) {
      const { id } = await createExport(session.userId, undefined, status);
      const read = await ExportsService.getExportStatus(session, id);
      expect(read).toMatchObject({ id, status, fileName: "test-sheet.pdf" });
      expect(read).not.toHaveProperty("data");
    }
  });

  test("hides another user's export, a missing one and an expired one", async () => {
    const { session: owner } = await createTestUser();
    const { session: other } = await createTestUser();
    const { id } = await createExport(owner.userId, undefined, "pending");
    expect(ExportsService.getExportStatus(other, id)).rejects.toThrow(NotFoundError);
    expect(ExportsService.getExportStatus(owner, NIL_UUID)).rejects.toThrow(NotFoundError);
    const expired = await createExport(owner.userId, new Date(Date.now() - 1000).toISOString(), "pending");
    expect(ExportsService.getExportStatus(owner, expired.id)).rejects.toThrow("expired");
  });
});
