import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@/server/errors/index.ts";
import ExportsService from "@/server/services/ExportsService.ts";
import { createExport, createTestUser, NIL_UUID } from "@/tests/helpers.ts";

describe("ExportsService.download", () => {
  test("returns the owner's export", async () => {
    const { session } = await createTestUser();
    const { id } = await createExport(session.userId);
    expect(await ExportsService.download(session, id)).toMatchObject({ id, fileName: "test-sheet.pdf" });
  });

  test("hides another user's export", async () => {
    const { session: owner } = await createTestUser();
    const { session: other } = await createTestUser();
    const { id } = await createExport(owner.userId);
    await expect(ExportsService.download(other, id)).rejects.toThrow(NotFoundError);
  });

  test("throws NotFoundError for a missing or expired export", async () => {
    const { session } = await createTestUser();
    await expect(ExportsService.download(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    const expired = await createExport(session.userId, new Date(Date.now() - 1000).toISOString());
    await expect(ExportsService.download(session, expired.id)).rejects.toThrow("expired");
  });
});
