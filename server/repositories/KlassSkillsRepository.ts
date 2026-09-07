import { and, eq, inArray, isNull } from "drizzle-orm";

import { klassSkillsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class KlassSkillsRepository extends BaseRepository<typeof klassSkillsInRules, KlassSkillInstance> {
  constructor() {
    super(klassSkillsInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof klassSkillsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassSkillsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof klassSkillsInRules>>,
    where: { klassId: string; skillId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassId, where.klassId),
          eq(this.table.skillId, where.skillId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async archive(db: Db, where: { klassId: string; skillId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassId, where.klassId),
          eq(this.table.skillId, where.skillId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  async archiveByKlassId(db: Db, where: { klassId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.klassId, where.klassId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { klassId: string; skillId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(
          eq(this.table.klassId, where.klassId),
          eq(this.table.skillId, where.skillId),
        ),
      )
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteByKlassId(db: Db, where: { klassId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.klassId, where.klassId))
      .returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async deleteBySkillId(db: Db, where: { skillId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.skillId, where.skillId))
      .returning();
  }

  async findOne(db: Db, where: { klassId: string; skillId: string }) {
    return await db.query.klassSkillsInRules.findFirst({
      where: and(
        eq(this.table.klassId, where.klassId),
        eq(this.table.skillId, where.skillId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findMany(db: Db, where: { klassIds: string[] }) {
    return await db.query.klassSkillsInRules.findMany({
      where: and(
        inArray(this.table.klassId, where.klassIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async findManyWithSkills(db: Db, where: { klassId: string }) {
    return await db.query.klassSkillsInRules.findMany({
      where: and(
        eq(this.table.klassId, where.klassId),
        isNull(this.table.deletedAt),
      ),
      with: {
        skillsInRule: true,
      },
    });
  }

  withInstance(instance: InferSelectModel<typeof klassSkillsInRules>) {
    return new KlassSkillInstance(instance);
  }
}

class KlassSkillInstance extends Instance<InferSelectModel<typeof klassSkillsInRules>> {}

export default KlassSkillsRepository;
