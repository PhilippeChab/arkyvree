import { and, eq, inArray, type InferInsertModel, isNull } from "drizzle-orm";

import { powersAptitudesInRules, powersInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class PowersAptitudesRepository extends BaseRepository<typeof powersAptitudesInRules> {
  constructor() {
    super(powersAptitudesInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof powersAptitudesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof powersAptitudesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: disposable configuration data — intentional removal
  async delete(db: Db, where: { aptitudeId?: string; powerId: string } | { aptitudeId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "powerId" in where && eq(this.table.powerId, where.powerId),
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

  /** Links of powers, or a ruleset's powers' links to lists (`aptitudeIds`). */
  async findMany(
    db: Db,
    where: { powerIds: string[] } | { powerId: string } | { aptitudeIds: string[]; rulesetId: string },
  ) {
    if ("powerIds" in where && where.powerIds.length === 0) return [];
    if ("aptitudeIds" in where && where.aptitudeIds.length === 0) return [];
    return await db.query.powersAptitudesInRules.findMany({
      where: this.branchWhere(
        [
          "powerIds" in where && inArray(this.table.powerId, where.powerIds),
          "powerId" in where && eq(this.table.powerId, where.powerId),
          "aptitudeIds" in where && inArray(this.table.aptitudeId, where.aptitudeIds),
        ],
        [
          "rulesetId" in where &&
            inArray(
              this.table.powerId,
              db
                .select({ id: powersInRules.id })
                .from(powersInRules)
                .where(eq(powersInRules.rulesetId, where.rulesetId)),
            ),
          isNull(this.table.deletedAt),
        ],
      ),
      with: {
        aptitudesInRule: true,
      },
    });
  }

  async findOne(db: Db, where: { aptitudeId: string; powerId: string }) {
    return await db.query.powersAptitudesInRules.findFirst({
      where: and(
        eq(this.table.powerId, where.powerId),
        eq(this.table.aptitudeId, where.aptitudeId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  /** Repoints a power's link to another list. */
  async update(db: Db, values: { aptitudeId: string }, where: { aptitudeId: string; powerId: string }) {
    return await db
      .update(this.table)
      .set(values)
      .where(and(eq(this.table.powerId, where.powerId), eq(this.table.aptitudeId, where.aptitudeId)))
      .returning();
  }
}

export default PowersAptitudesRepository;
