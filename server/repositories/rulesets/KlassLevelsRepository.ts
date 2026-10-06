import { eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelsRepository extends BaseRepository<typeof klassLevelsInRules> {
  constructor() {
    super(klassLevelsInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof klassLevelsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findMany(db: Db, where: { klassId: string } | { klassIds: string[] }) {
    if ("klassIds" in where && where.klassIds.length === 0) return [];
    return await db.query.klassLevelsInRules.findMany({
      where: this.branchWhere(
        [
          "klassId" in where && eq(this.table.klassId, where.klassId),
          "klassIds" in where && inArray(this.table.klassId, where.klassIds),
        ],
        [isNull(this.table.deletedAt)],
      ),
      orderBy: [this.orderBy(this.table.level), this.orderBy(this.table.klassId)],
    });
  }

  async findOne(db: Db, where: { id: string } | { id: string; klassId: string }) {
    return await db.query.klassLevelsInRules.findFirst({
      where: this.branchWhere(
        [eq(this.table.id, where.id)],
        ["klassId" in where && eq(this.table.klassId, where.klassId), isNull(this.table.deletedAt)],
      ),
    });
  }
}

export default KlassLevelsRepository;
