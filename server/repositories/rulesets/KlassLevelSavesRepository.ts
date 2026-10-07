import { and, eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import { klassLevelSavesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelSavesRepository extends BaseRepository<typeof klassLevelSavesInRules> {
  constructor() {
    super(klassLevelSavesInRules);
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelSavesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data
  async delete(db: Db, where: { klassLevelId: string } | { saveId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId),
          "saveId" in where && eq(this.table.saveId, where.saveId),
        ]),
      )
      .returning();
  }

  async exists(db: Db, where: { saveId: string }) {
    const result = await db.query.klassLevelSavesInRules.findFirst({
      where: and(eq(this.table.saveId, where.saveId), isNull(this.table.deletedAt)),
    });
    return !!result;
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    if (where.klassLevelIds.length === 0) return [];
    return await db.query.klassLevelSavesInRules.findMany({
      where: and(inArray(this.table.klassLevelId, where.klassLevelIds), isNull(this.table.deletedAt)),
      orderBy: [
        this.orderBy(this.table.createdAt),
        this.orderBy(this.table.klassLevelId),
        this.orderBy(this.table.saveId),
      ],
    });
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
}

export default KlassLevelSavesRepository;
