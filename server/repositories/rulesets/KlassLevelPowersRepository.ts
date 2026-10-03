import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { klassLevelPowersInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelPowersRepository extends BaseRepository<typeof klassLevelPowersInRules> {
  constructor() {
    super(klassLevelPowersInRules);
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelPowersInRules.findMany({
      where: and(inArray(this.table.klassLevelId, where.klassLevelIds), isNull(this.table.deletedAt)),
    });
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelPowersInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByAptitudeId(db: Db, where: { aptitudeId: string }) {
    return await db.delete(this.table).where(eq(this.table.aptitudeId, where.aptitudeId)).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByKlassLevelId(db: Db, where: { klassLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.klassLevelId, where.klassLevelId)).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByPowerId(db: Db, where: { powerId: string }) {
    return await db.delete(this.table).where(eq(this.table.powerId, where.powerId)).returning();
  }
}

export default KlassLevelPowersRepository;
