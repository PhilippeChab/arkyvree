import { eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { klassLevelFeatsInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelFeatsRepository extends BaseRepository<typeof klassLevelFeatsInRules> {
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

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { klassLevelId: string }) {
    return await db
      .delete(this.table)
      .where(this.branchWhere(["klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId)]))
      .returning();
  }

  /** Levels' grants. */
  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    if (where.klassLevelIds.length === 0) return [];
    return await db.query.klassLevelFeatsInRules.findMany({
      where: this.branchWhere([inArray(this.table.klassLevelId, where.klassLevelIds)], [isNull(this.table.deletedAt)]),
      orderBy: [this.orderBy(this.table.createdAt), this.orderBy(this.table.id)],
    });
  }
}

export default KlassLevelFeatsRepository;
