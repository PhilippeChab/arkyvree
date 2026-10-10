import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { klassesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class KlassesRepository extends RulesetEntityRepository<typeof klassesInRules> {
  constructor() {
    super(klassesInRules);
  }

  protected override readonly entityType = "klasses";

  async findMany(db: Db, where: { ids: string[] }) {
    if (where.ids.length === 0) return [];
    return await db.query.klassesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.klassesInRules.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "name" in where && eq(this.table.name, where.name)],
        ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
      ),
    });
  }

  async findPage(
    db: Db,
    where: RulesetEntityFilters<{ characterId?: string; kind?: string }>,
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc", characterId, kind } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const orderByClause = characterId
      ? [
          this.orderBy(
            sql`COALESCE((
              SELECT MAX(kl.level)
              FROM rules.klass_levels kl
              JOIN character.levels cl ON cl.klass_level_id = kl.id
              WHERE kl.klass_id = ${this.table.id}
              AND cl.character_id = ${characterId}
              AND cl.deleted_at IS NULL
            ), 0)`,
            "desc",
          ),
          this.orderBy(this.table.name),
        ]
      : this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir));

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.klassesInRules.findMany({
          where: this.where([
            rulesetCondition,
            isNull(this.table.deletedAt),
            kind !== undefined && eq(this.table.kind, kind),
            searchConditions,
          ]),
          orderBy: this.pageOrder(orderByClause),
          limit,
          offset,
        }),
    );
  }
}

export default KlassesRepository;
