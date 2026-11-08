import { eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { documentReadersInCampaign, documentsInCampaign } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class DocumentReadersRepository extends BaseRepository<typeof documentReadersInCampaign> {
  constructor() {
    super(documentReadersInCampaign);
  }

  /** Names the seats (`playerIds`) a Selected folder or document (`documentId`) admits. */
  async create(db: Db, where: { documentId: string; playerIds: readonly string[] }) {
    if (where.playerIds.length === 0) return [];
    const rows = where.playerIds.map((playerId) => ({ documentId: where.documentId, playerId }));
    return await db.insert(this.table).values(rows).returning();
  }

  /** Forgets the seats a folder or a document (`documentId`) admits. */
  async delete(db: Db, where: { documentId: string }) {
    return await db.delete(this.table).where(eq(this.table.documentId, where.documentId));
  }

  /** The seats a campaign's folders and documents admit, each a row, by document, then seat. */
  async findMany(db: Db, where: { campaignId: string }) {
    return await db
      .select({ documentId: this.table.documentId, playerId: this.table.playerId })
      .from(this.table)
      .innerJoin(documentsInCampaign, eq(documentsInCampaign.id, this.table.documentId))
      .where(eq(documentsInCampaign.campaignId, where.campaignId))
      .orderBy(this.orderBy(this.table.documentId), this.orderBy(this.table.playerId));
  }
}

export default DocumentReadersRepository;
