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

  async findMany(db: Db, where: { klassIds: string[] }) {
    return await db.query.klassSkillsInRules.findMany({
      where: and(
        inArray(this.table.klassId, where.klassIds),
        isNull(this.table.deletedAt),
      ),
    });
  }

  withInstance(instance: InferSelectModel<typeof klassSkillsInRules>) {
    return new KlassSkillInstance(instance);
  }
}

class KlassSkillInstance extends Instance<InferSelectModel<typeof klassSkillsInRules>> {}

export default KlassSkillsRepository;
