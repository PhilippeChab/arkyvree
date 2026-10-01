import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@/server/errors/index.ts";
import { ExportsMethods } from "@/server/services/ExportsService.ts";
import { createExport, createTestUser, NIL_UUID } from "@/tests/helpers.ts";

describe("ExportsService.download", () => {
  test("returns the owner's export", async () => {
    const { session } = await createTestUser();
    const { id } = await createExport(session.userId);
    expect(await ExportsMethods.download(session, id)).toMatchObject({ id, fileName: "test-sheet.pdf" });
  });

  test("hides another user's export", async () => {
    const { session: owner } = await createTestUser();
    const { session: other } = await createTestUser();
    const { id } = await createExport(owner.userId);
    await expect(ExportsMethods.download(other, id)).rejects.toThrow(NotFoundError);
  });

  test("throws NotFoundError for a missing or expired export", async () => {
    const { session } = await createTestUser();
    await expect(ExportsMethods.download(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    const expired = await createExport(session.userId, new Date(Date.now() - 1000).toISOString());
    await expect(ExportsMethods.download(session, expired.id)).rejects.toThrow("expired");
  });
});
