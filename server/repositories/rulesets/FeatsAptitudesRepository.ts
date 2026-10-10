import { eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { featsAptitudesInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class FeatsAptitudesRepository extends BaseRepository<typeof featsAptitudesInRules> {
  constructor() {
    super(featsAptitudesInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof featsAptitudesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof featsAptitudesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { featId: string }) {
    return await db
      .delete(this.table)
      .where(this.branchWhere(["featId" in where && eq(this.table.featId, where.featId)]))
      .returning();
  }

  /** Links of feats. */
  async findMany(db: Db, where: { featIds: string[] } | { featId: string }) {
    if ("featIds" in where && where.featIds.length === 0) return [];
    return await db.query.featsAptitudesInRules.findMany({
      where: this.branchWhere(
        [
          "featIds" in where && inArray(this.table.featId, where.featIds),
          "featId" in where && eq(this.table.featId, where.featId),
        ],
        [isNull(this.table.deletedAt)],
      ),
    });
  }
}

export default FeatsAptitudesRepository;
