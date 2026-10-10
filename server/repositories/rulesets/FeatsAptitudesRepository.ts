import { and, eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { featsAptitudesInRules, featsInRules } from "@/drizzle/schema.ts";
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
  async delete(db: Db, where: { aptitudeId?: string; featId: string } | { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "featId" in where && eq(this.table.featId, where.featId),
          where.aptitudeId !== undefined && eq(this.table.aptitudeId, where.aptitudeId),
        ]),
      )
      .returning();
  }

  /** Links of feats, or a ruleset's feats' links to lists (`aptitudeIds`). */
  async findMany(
    db: Db,
    where: { featIds: string[] } | { featId: string } | { aptitudeIds: string[]; rulesetId: string },
  ) {
    if ("featIds" in where && where.featIds.length === 0) return [];
    if ("aptitudeIds" in where && where.aptitudeIds.length === 0) return [];
    return await db.query.featsAptitudesInRules.findMany({
      where: this.branchWhere(
        [
          "featIds" in where && inArray(this.table.featId, where.featIds),
          "featId" in where && eq(this.table.featId, where.featId),
          "aptitudeIds" in where && inArray(this.table.aptitudeId, where.aptitudeIds),
        ],
        [
          "rulesetId" in where &&
            inArray(
              this.table.featId,
              db.select({ id: featsInRules.id }).from(featsInRules).where(eq(featsInRules.rulesetId, where.rulesetId)),
            ),
          isNull(this.table.deletedAt),
        ],
      ),
      with: {
        aptitudesInRule: true,
      },
    });
  }

  /** Repoints a feat's link to another list. */
  async update(db: Db, values: { aptitudeId: string }, where: { aptitudeId: string; featId: string }) {
    return await db
      .update(this.table)
      .set(values)
      .where(and(eq(this.table.featId, where.featId), eq(this.table.aptitudeId, where.aptitudeId)))
      .returning();
  }
}

export default FeatsAptitudesRepository;
