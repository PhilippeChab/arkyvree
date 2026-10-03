import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { klassLevelSavesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelSavesRepository extends BaseRepository<typeof klassLevelSavesInRules> {
  constructor() {
    super(klassLevelSavesInRules);
  }

  async exists(db: Db, where: { saveId: string }) {
    const result = await db.query.klassLevelSavesInRules.findFirst({
      where: and(eq(this.table.saveId, where.saveId), isNull(this.table.deletedAt)),
    });
    return !!result;
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelSavesInRules.findMany({
      where: and(inArray(this.table.klassLevelId, where.klassLevelIds), isNull(this.table.deletedAt)),
    });
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
        this.writeWhere([
          "klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId),
          "saveId" in where && eq(this.table.saveId, where.saveId),
        ]),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
}

export default KlassLevelSavesRepository;
