import { and, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";

import { aptitudesInRules, featsAptitudesInRules, powersAptitudesInRules } from "@/drizzle/schema.ts";
import { InternalError } from "@/server/errors/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class AptitudesRepository extends BaseRepository<typeof aptitudesInRules, AptitudeInstance> {
  constructor() {
    super(aptitudesInRules, "aptitudes");
  }

  async create(db: Db, values: InferInsertModel<typeof aptitudesInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof aptitudesInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof aptitudesInRules>>,
    where: { id: string; expectedUpdatedAt?: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(this.where([
        eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ]))
      .returning();
  }

  async archive(): Promise<never> {
    throw new InternalError("aptitudes don't soft-archive — use Aptitudes.delete()");
  }

  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id)).returning();
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.aptitudesInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "name" in where && eq(this.table.name, where.name),
        "id" in where && eq(this.table.id, where.id),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(db: Db, where: { ids: string[] } | { rulesetIds: string[] }) {
    const condition = "ids" in where
      ? inArray(this.table.id, where.ids)
      : inArray(this.table.rulesetId, where.rulesetIds);
    return await db.query.aptitudesInRules.findMany({
      where: and(condition, isNull(this.table.deletedAt)),
      orderBy: (aptitudes, { asc }) => [asc(aptitudes.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where:
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; scope?: "feats" | "spells"; excludeIds?: string[]; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" }
      | { rulesetId: string; ancestorRulesetIds?: string[]; childOnly?: boolean; scope?: "feats" | "spells"; excludeIds?: string[]; campaignId: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc", scope, excludeIds } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const scopeCondition = scope === "feats"
      ? inArray(this.table.id, db.select({ id: featsAptitudesInRules.aptitudeId }).from(featsAptitudesInRules))
      : scope === "spells"
        ? inArray(this.table.id, db.select({ id: powersAptitudesInRules.aptitudeId }).from(powersAptitudesInRules))
        : false;

    const excludeCondition = excludeIds && excludeIds.length > 0
      ? notInArray(this.table.id, excludeIds)
      : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.aptitudesInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, scopeCondition, excludeCondition]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async findLeveledAptitudeIds(db: Db, where: { aptitudeIds: string[] }) {
    const rows = await db
      .selectDistinct({ aptitudeId: powersAptitudesInRules.aptitudeId })
      .from(powersAptitudesInRules)
      .where(
        and(
          inArray(powersAptitudesInRules.aptitudeId, where.aptitudeIds),
          isNotNull(powersAptitudesInRules.level),
        ),
      );
    return new Set(rows.map((r) => r.aptitudeId));
  }

  withInstance(instance: InferSelectModel<typeof aptitudesInRules>) {
    return new AptitudeInstance(instance);
  }
}

class AptitudeInstance extends Instance<InferSelectModel<typeof aptitudesInRules>> {}

export default AptitudesRepository;
