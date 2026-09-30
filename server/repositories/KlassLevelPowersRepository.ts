import { and, eq, inArray, isNull } from "drizzle-orm";

import { klassLevelPowersInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class KlassLevelPowersRepository
  extends BaseRepository<typeof klassLevelPowersInRules, KlassLevelPowerInstance> {
  constructor() {
    super(klassLevelPowersInRules);
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelPowersInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByKlassLevelId(db: Db, where: { klassLevelId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.klassLevelId, where.klassLevelId))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByPowerId(db: Db, where: { powerId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.powerId, where.powerId))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByAptitudeId(db: Db, where: { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.aptitudeId, where.aptitudeId))
      .returning();
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelPowersInRules.findMany({
      where: and(
        inArray(this.table.klassLevelId, where.klassLevelIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  withInstance(instance: InferSelectModel<typeof klassLevelPowersInRules>) {
    return new KlassLevelPowerInstance(instance);
  }
}

class KlassLevelPowerInstance extends Instance<InferSelectModel<typeof klassLevelPowersInRules>> {}

export default KlassLevelPowersRepository;
