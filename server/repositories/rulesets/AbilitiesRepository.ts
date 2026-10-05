import { and, eq, inArray, isNull } from "drizzle-orm";

import { abilitiesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

/** The abilities: immutable, read and created (by a ruleset's seed), never edited or deleted. */
class AbilitiesRepository extends RulesetEntityRepository<typeof abilitiesInRules> {
  constructor() {
    super(abilitiesInRules);
  }

  protected readonly entityType = "abilities";

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.abilitiesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.abilitiesInRules.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "name" in where && eq(this.table.name, where.name)],
        ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
      ),
    });
  }

  async findPage(db: Db, where: RulesetEntityFilters, pagination: { limit: number; page: number }) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.abilitiesInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async update(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be edited");
  }

  async delete(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be deleted");
  }
}

export default AbilitiesRepository;
