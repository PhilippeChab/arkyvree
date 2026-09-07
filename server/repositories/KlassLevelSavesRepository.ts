import { and, eq, inArray, isNull } from "drizzle-orm";

import { klassLevelSavesInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class KlassLevelSavesRepository
  extends BaseRepository<typeof klassLevelSavesInRules, KlassLevelSaveInstance> {
  constructor() {
    super(klassLevelSavesInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof klassLevelSavesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelSavesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof klassLevelSavesInRules>>,
    where: { klassLevelId: string; saveId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.saveId, where.saveId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async archive(db: Db, where: { klassLevelId: string; saveId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.saveId, where.saveId),
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
  async delete(db: Db, where: { klassLevelId: string; saveId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(
          eq(this.table.klassLevelId, where.klassLevelId),
          eq(this.table.saveId, where.saveId),
        ),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data
  async deleteByKlassLevelId(db: Db, where: { klassLevelId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.klassLevelId, where.klassLevelId))
      .returning();
  }

  async findOne(db: Db, where: { klassLevelId: string; saveId: string }) {
    return await db.query.klassLevelSavesInRules.findFirst({
      where: and(
        eq(this.table.klassLevelId, where.klassLevelId),
        eq(this.table.saveId, where.saveId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteBySaveId(db: Db, where: { saveId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.saveId, where.saveId))
      .returning();
  }

  async existsBySaveId(db: Db, where: { saveId: string }) {
    const result = await db.query.klassLevelSavesInRules.findFirst({
      where: and(
        eq(this.table.saveId, where.saveId),
        isNull(this.table.deletedAt),
      ),
    });
    return !!result;
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelSavesInRules.findMany({
      where: and(
        inArray(this.table.klassLevelId, where.klassLevelIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  withInstance(instance: InferSelectModel<typeof klassLevelSavesInRules>) {
    return new KlassLevelSaveInstance(instance);
  }
}

class KlassLevelSaveInstance extends Instance<InferSelectModel<typeof klassLevelSavesInRules>> {}

export default KlassLevelSavesRepository;
