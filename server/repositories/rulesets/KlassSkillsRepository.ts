import { and, eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { klassSkillsInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassSkillsRepository extends BaseRepository<typeof klassSkillsInRules> {
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
  async delete(db: Db, where: { klassId: string; skillId: string } | { klassId: string } | { skillId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "klassId" in where && eq(this.table.klassId, where.klassId),
          "skillId" in where && eq(this.table.skillId, where.skillId),
        ]),
      )
      .returning();
  }

  async findMany(db: Db, where: { klassIds: string[] }) {
    if (where.klassIds.length === 0) return [];
    return await db.query.klassSkillsInRules.findMany({
      where: and(inArray(this.table.klassId, where.klassIds), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.createdAt), this.orderBy(this.table.klassId), this.orderBy(this.table.skillId)],
    });
  }
}

export default KlassSkillsRepository;
