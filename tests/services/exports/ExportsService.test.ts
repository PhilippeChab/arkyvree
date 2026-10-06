import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@/server/errors/index.ts";
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
    await expect(ExportsService.getExport(other, id)).rejects.toThrow(NotFoundError);
  });

  test("throws NotFoundError for a missing or expired export", async () => {
    const { session } = await createTestUser();
    await expect(ExportsService.getExport(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    const expired = await createExport(session.userId, new Date(Date.now() - 1000).toISOString());
    await expect(ExportsService.getExport(session, expired.id)).rejects.toThrow("expired");
  });
});
