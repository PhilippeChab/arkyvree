import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { addJob, db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Exports } from "@/server/repositories/index.ts";
import { ExportsService, toExportJobKey } from "@/server/services/exports/index.ts";
import { createExport } from "@/tests/support/files.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** Queues the job of a pending export, as a PDF's queueing does. */
async function queueExportJob(exportId: string) {
  await addJob(db, "generatePdf", { exportId }, { jobKey: toExportJobKey(exportId), maxAttempts: 2 });
}

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
      if (status === "pending") await queueExportJob(id);
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

  test("answers a pending export failed once its job is gone, which its download refuses as failed", async () => {
    const { session } = await createTestUser();
    const { id } = await createExport(session.userId, undefined, "pending");
    await queueExportJob(id);
    // Still to run, however long it waits behind the user's other PDFs or for a worker
    expect(await ExportsService.getExportStatus(session, id)).toMatchObject({ id, status: "pending" });

    // Its last attempt taken, which the worker counts as it takes it: still running
    const job = sql`graphile_worker._private_jobs`;
    const key = toExportJobKey(id);
    await db.execute(sql`UPDATE ${job} SET attempts = max_attempts, locked_at = now() WHERE key = ${key}`);
    expect(await ExportsService.getExportStatus(session, id)).toMatchObject({ id, status: "pending" });

    // Its last attempt's worker killed mid-render: its lock past the worker's four hours
    await db.execute(sql`UPDATE ${job} SET locked_at = now() - interval '5 hours' WHERE key = ${key}`);
    expect(await ExportsService.getExportStatus(session, id)).toMatchObject({ id, status: "failed" });
    expect(ExportsService.getExport(session, id)).rejects.toThrow("failed");
    // Stored failed as it's answered: the attempt that outlived its lock, if it finishes, finds it failed
    expect((await Exports.findStatus(db, { id, userId: session.userId }))?.status).toBe("failed");
  });
});
