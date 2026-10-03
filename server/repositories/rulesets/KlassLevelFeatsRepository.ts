import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { klassLevelFeatsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelFeatsRepository extends BaseRepository<typeof klassLevelFeatsInRules> {
  constructor() {
    super(klassLevelFeatsInRules);
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelFeatsInRules.findMany({
      where: and(inArray(this.table.klassLevelId, where.klassLevelIds), isNull(this.table.deletedAt)),
    });
  }

  async create(db: Db, values: InferInsertModel<typeof klassLevelFeatsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelFeatsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByAptitudeId(db: Db, where: { aptitudeId: string }) {
    return await db.delete(this.table).where(eq(this.table.aptitudeId, where.aptitudeId)).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByFeatId(db: Db, where: { featId: string }) {
    return await db.delete(this.table).where(eq(this.table.featId, where.featId)).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByKlassLevelId(db: Db, where: { klassLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.klassLevelId, where.klassLevelId)).returning();
  }
}

export default KlassLevelFeatsRepository;
