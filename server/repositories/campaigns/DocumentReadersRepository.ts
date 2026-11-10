import { eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { documentReadersInCampaign } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class DocumentReadersRepository extends BaseRepository<typeof documentReadersInCampaign> {
  constructor() {
    super(documentReadersInCampaign);
  }

  /** Names the seats (`playerIds`) a Selected folder or document (`documentId`) admits. */
  async create(db: Db, values: { documentId: string; playerIds: readonly string[] }) {
    if (values.playerIds.length === 0) return [];
    const rows = values.playerIds.map((playerId) => ({ documentId: values.documentId, playerId }));
    return await db.insert(this.table).values(rows).returning();
  }

  /** Forgets the seats a folder or a document (`documentId`) admits. */
  async delete(db: Db, where: { documentId: string }) {
    return await db.delete(this.table).where(eq(this.table.documentId, where.documentId));
  }
}

export default DocumentReadersRepository;
