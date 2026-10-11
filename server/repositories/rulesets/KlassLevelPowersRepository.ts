import { inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { klassLevelPowersInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelPowersRepository extends BaseRepository<typeof klassLevelPowersInRules> {
  constructor() {
    super(klassLevelPowersInRules);
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelPowersInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  /** Levels' grants. */
  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    if (where.klassLevelIds.length === 0) return [];
    return await db.query.klassLevelPowersInRules.findMany({
      where: this.branchWhere([inArray(this.table.klassLevelId, where.klassLevelIds)], [isNull(this.table.deletedAt)]),
      orderBy: [
        this.orderBy(this.table.createdAt),
        this.orderBy(this.table.klassLevelId),
        this.orderBy(this.table.powerId),
      ],
    });
  }
}

export default KlassLevelPowersRepository;
