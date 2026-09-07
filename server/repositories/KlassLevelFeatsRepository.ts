import { and, eq, inArray, isNull } from "drizzle-orm";

import { klassLevelFeatsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class KlassLevelFeatsRepository
  extends BaseRepository<typeof klassLevelFeatsInRules, KlassLevelFeatInstance> {
  constructor() {
    super(klassLevelFeatsInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof klassLevelFeatsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelFeatsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof klassLevelFeatsInRules>>,
    where: { klassLevelId: string; featId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.featId, where.featId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async archive(db: Db, where: { klassLevelId: string; featId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.featId, where.featId),
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
  async delete(db: Db, where: { klassLevelId: string; featId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.featId, where.featId),
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
  async deleteByFeatId(db: Db, where: { featId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.featId, where.featId))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByAptitudeId(db: Db, where: { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.aptitudeId, where.aptitudeId))
      .returning();
  }

  async findOne(db: Db, where: { klassLevelId: string; featId: string }) {
    return await db.query.klassLevelFeatsInRules.findFirst({
      where: and(
        eq(this.table.klassLevelId, where.klassLevelId),
        eq(this.table.featId, where.featId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelFeatsInRules.findMany({
      where: and(
        inArray(this.table.klassLevelId, where.klassLevelIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findManyWithFeats(db: Db, where: { klassLevelId: string } | { klassLevelIds: string[] }) {
    return await db.query.klassLevelFeatsInRules.findMany({
      where: this.where([
        "klassLevelIds" in where
          ? inArray(this.table.klassLevelId, where.klassLevelIds)
          : eq(this.table.klassLevelId, where.klassLevelId),
        isNull(this.table.deletedAt),
      ]),
      with: {
        featsInRule: true,
      },
    });
  }

  withInstance(instance: InferSelectModel<typeof klassLevelFeatsInRules>) {
    return new KlassLevelFeatInstance(instance);
  }
}

class KlassLevelFeatInstance extends Instance<InferSelectModel<typeof klassLevelFeatsInRules>> {}

export default KlassLevelFeatsRepository;
