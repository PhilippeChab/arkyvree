import { countJobsToRun, db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Exports } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import { toExportJobKey } from "./exportJobKey.ts";

class ExportsService {
  /**
   * An export as it's read, unless it's none of the session's user's or past its expiry: then it's gone. A pending one
   * whose job is gone reads failed: its job lost it (a worker killed past its last attempt, one deployed past its
   * payload), which a job that fails marks itself. One still queued behind others, or waiting on a worker, stays
   * pending. A pending one's jobs are counted before it's read again: the worker stores the export before it deletes
   * the job that made it, so an export whose job is gone by then reads as that job left it.
   */
  private async readExport<T extends { expiresAt: string; status: string }>(
    exportId: string,
    read: () => Promise<T | undefined>,
  ) {
    let exportRecord = await read();
    if (!exportRecord) throw new NotFoundError("Export not found");

    if (new Date(exportRecord.expiresAt) < new Date()) throw new NotFoundError("Export has expired");
    if (exportRecord.status !== "pending") return exportRecord;

    const jobsToRun = await countJobsToRun(toExportJobKey(exportId));
    exportRecord = (await read()) ?? exportRecord;
    const lost = exportRecord.status === "pending" && jobsToRun === 0;
    return lost ? { ...exportRecord, status: "failed" as const } : exportRecord;
  }

  /** An export's file, once it's ready: a pending or failed one has none to download. */
  async getExport(session: Session, exportId: string) {
    const where = { id: exportId, userId: session.userId };
    const exportRecord = await this.readExport(exportId, () => Exports.findOne(db, where));

    const { data, status } = exportRecord;
    if (status === "failed") throw new ConflictError("The export failed: queue it again");
    if (status === "pending" || !data) throw new ConflictError("The export isn't ready yet");

    return { ...exportRecord, data };
  }

  /** Where an export stands, without its file: pending, ready to download, or failed. */
  async getExportStatus(session: Session, exportId: string) {
    const where = { id: exportId, userId: session.userId };
    return await this.readExport(exportId, () => Exports.findStatus(db, where));
  }
}

export default new ExportsService();
