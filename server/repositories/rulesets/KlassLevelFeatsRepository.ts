import { eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { klassesInRules, klassLevelFeatsInRules, klassLevelsInRules } from "@/drizzle/schema.ts";
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
  async delete(db: Db, where: { klassLevelId: string } | { featId: string } | { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId),
          "featId" in where && eq(this.table.featId, where.featId),
          "aptitudeId" in where && eq(this.table.aptitudeId, where.aptitudeId),
        ]),
      )
      .returning();
  }

  /** Levels' grants, or a ruleset's classes' grants from lists (`aptitudeIds`). */
  async findMany(db: Db, where: { klassLevelIds: string[] } | { aptitudeIds: string[]; rulesetId: string }) {
    if ("klassLevelIds" in where && where.klassLevelIds.length === 0) return [];
    if ("aptitudeIds" in where && where.aptitudeIds.length === 0) return [];
    return await db.query.klassLevelFeatsInRules.findMany({
      where: this.branchWhere(
        [
          "klassLevelIds" in where && inArray(this.table.klassLevelId, where.klassLevelIds),
          "aptitudeIds" in where && inArray(this.table.aptitudeId, where.aptitudeIds),
        ],
        [
          "rulesetId" in where &&
            inArray(
              this.table.klassLevelId,
              db
                .select({ id: klassLevelsInRules.id })
                .from(klassLevelsInRules)
                .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
                .where(eq(klassesInRules.rulesetId, where.rulesetId)),
            ),
          isNull(this.table.deletedAt),
        ],
      ),
      orderBy: [this.orderBy(this.table.createdAt), this.orderBy(this.table.id)],
    });
  }

  /** Repoints a level's grant to another list. */
  async update(db: Db, values: { aptitudeId: string }, where: { id: string }) {
    return await db.update(this.table).set(values).where(eq(this.table.id, where.id)).returning();
  }
}

export default KlassLevelFeatsRepository;
