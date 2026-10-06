import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { klassLevelPowersInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class KlassLevelPowersRepository extends BaseRepository<typeof klassLevelPowersInRules> {
  constructor() {
    super(klassLevelPowersInRules);
  }

  async createMany(db: Db, values: InferInsertModel<typeof klassLevelPowersInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { klassLevelId: string } | { powerId: string } | { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId),
          "powerId" in where && eq(this.table.powerId, where.powerId),
          "aptitudeId" in where && eq(this.table.aptitudeId, where.aptitudeId),
        ]),
      )
      .returning();
  }

  async findMany(db: Db, where: { klassLevelIds: string[] }) {
    return await db.query.klassLevelPowersInRules.findMany({
      where: and(inArray(this.table.klassLevelId, where.klassLevelIds), isNull(this.table.deletedAt)),
      orderBy: [
        this.orderBy(this.table.createdAt),
        this.orderBy(this.table.klassLevelId),
        this.orderBy(this.table.powerId),
      ],
    });
  }
}

export default KlassLevelPowersRepository;
