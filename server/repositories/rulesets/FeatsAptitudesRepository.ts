import { and, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { featsAptitudesInRules, featsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
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
  async delete(db: Db, where: { featId: string; aptitudeId?: string } | { aptitudeId: string }) {
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

  async findAptitudeIds(db: Db, where: { aptitudeIds: string[] }) {
    if (where.aptitudeIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ aptitudeId: this.table.aptitudeId })
      .from(this.table)
      .where(and(inArray(this.table.aptitudeId, where.aptitudeIds), isNull(this.table.deletedAt)));
    return rows.map((r) => r.aptitudeId);
  }

  /** Links of feats, or a ruleset's feats' links to lists (`aptitudeIds`). */
  async findMany(
    db: Db,
    where: { featIds: string[] } | { featId: string } | { rulesetId: string; aptitudeIds: string[] },
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
  async update(db: Db, values: { aptitudeId: string }, where: { featId: string; aptitudeId: string }) {
    return await db
      .update(this.table)
      .set(values)
      .where(and(eq(this.table.featId, where.featId), eq(this.table.aptitudeId, where.aptitudeId)))
      .returning();
  }
}

export default FeatsAptitudesRepository;
