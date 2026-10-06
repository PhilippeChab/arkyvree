import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { aptitudesInRules, featsAptitudesInRules, powersAptitudesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class AptitudesRepository extends RulesetEntityRepository<typeof aptitudesInRules> {
  constructor() {
    super(aptitudesInRules);
  }

  protected readonly entityType = "aptitudes";

  async findLeveledIds(db: Db, where: { aptitudeIds: string[] }) {
    const rows = await db
      .selectDistinct({ aptitudeId: powersAptitudesInRules.aptitudeId })
      .from(powersAptitudesInRules)
      .where(
        and(inArray(powersAptitudesInRules.aptitudeId, where.aptitudeIds), isNotNull(powersAptitudesInRules.level)),
      );
    return new Set(rows.map((r) => r.aptitudeId));
  }

  async findMany(db: Db, where: { ids: string[] } | { rulesetIds: string[] }) {
    return await db.query.aptitudesInRules.findMany({
      where: this.branchWhere(
        [
          "ids" in where && inArray(this.table.id, where.ids),
          "rulesetIds" in where && inArray(this.table.rulesetId, where.rulesetIds),
        ],
        [isNull(this.table.deletedAt)],
      ),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.aptitudesInRules.findFirst({
      where: this.branchWhere(
        ["name" in where && eq(this.table.name, where.name), "id" in where && eq(this.table.id, where.id)],
        ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
      ),
    });
  }

  async findPage(
    db: Db,
    where: RulesetEntityFilters<{ scope?: "feats" | "spells" }>,
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc", scope } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const scopeCondition =
      scope === "feats"
        ? inArray(this.table.id, db.select({ id: featsAptitudesInRules.aptitudeId }).from(featsAptitudesInRules))
        : scope === "spells"
          ? inArray(this.table.id, db.select({ id: powersAptitudesInRules.aptitudeId }).from(powersAptitudesInRules))
          : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.aptitudesInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, scopeCondition]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }
}

export default AptitudesRepository;
