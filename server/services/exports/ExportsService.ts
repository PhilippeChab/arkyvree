import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Exports } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

class ExportsService {
  async download(session: Session, exportId: string) {
    const exportRecord = await Exports.findOne(db, {
      id: exportId,
      userId: session.userId,
    });

    if (!exportRecord) {
      throw new NotFoundError("Export not found");
    }

    if (new Date(exportRecord.expiresAt) < new Date()) {
      throw new NotFoundError("Export has expired");
    }

    return exportRecord;
  }
}

export default new ExportsService();
