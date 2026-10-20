import { db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Exports } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

class ExportsService {
  /** An export as it's read, unless it's none of the session's user's or past its expiry: then it's gone. */
  private checkFound<T extends { expiresAt: string }>(exportRecord: T | undefined) {
    if (!exportRecord) throw new NotFoundError("Export not found");

    if (new Date(exportRecord.expiresAt) < new Date()) throw new NotFoundError("Export has expired");

    return exportRecord;
  }

  /** An export's file, once it's ready: a pending or failed one has none to download. */
  async getExport(session: Session, exportId: string) {
    const exportRecord = this.checkFound(await Exports.findOne(db, { id: exportId, userId: session.userId }));

    const { data, status } = exportRecord;
    if (status === "failed") throw new ConflictError("The export failed: queue it again");
    if (status === "pending" || !data) throw new ConflictError("The export isn't ready yet");

    return { ...exportRecord, data };
  }

  /** Where an export stands, without its file: pending, ready to download, or failed. */
  async getExportStatus(session: Session, exportId: string) {
    return this.checkFound(await Exports.findStatus(db, { id: exportId, userId: session.userId }));
  }
}

export default new ExportsService();
