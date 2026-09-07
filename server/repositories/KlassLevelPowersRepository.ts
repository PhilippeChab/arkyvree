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

  async create(db: Db, values: InferInsertModel<typeof klassLevelPowersInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelPowersInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof klassLevelPowersInRules>>,
    where: { klassLevelId: string; powerId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.powerId, where.powerId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async archive(db: Db, where: { klassLevelId: string; powerId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.powerId, where.powerId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async archiveByKlassLevelId(db: Db, where: { klassLevelId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { klassLevelId: string; powerId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.powerId, where.powerId),
        ),
      )
      .returning();
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

  async findOne(db: Db, where: { klassLevelId: string; powerId: string }) {
    return await db.query.klassLevelPowersInRules.findFirst({
      where: and(
        eq(this.table.klassLevelId, where.klassLevelId),
        eq(this.table.powerId, where.powerId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelPowersInRules.findMany({
      where: and(
        inArray(this.table.klassLevelId, where.klassLevelIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findManyWithPowers(db: Db, where: { klassLevelId: string }) {
    return await db.query.klassLevelPowersInRules.findMany({
      where: and(
        eq(this.table.klassLevelId, where.klassLevelId),
        isNull(this.table.deletedAt),
      ),
      with: {
        powersInRule: true,
      },
    });
  }

  withInstance(instance: InferSelectModel<typeof klassLevelPowersInRules>) {
    return new KlassLevelPowerInstance(instance);
  }
}

class KlassLevelPowerInstance extends Instance<InferSelectModel<typeof klassLevelPowersInRules>> {}

export default KlassLevelPowersRepository;
