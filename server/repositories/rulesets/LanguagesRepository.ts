import { and, eq, inArray, isNull } from "drizzle-orm";

import { languagesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class LanguagesRepository extends RulesetEntityRepository<typeof languagesInRules> {
  constructor() {
    super(languagesInRules);
  }

  protected readonly entityType = "languages";

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.languagesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.languagesInRules.findFirst({
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
      return await db.query.languagesInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions]),
        orderBy: this.pageOrder(this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir))),
        limit,
        offset,
      });
    });
  }
}

export default LanguagesRepository;
