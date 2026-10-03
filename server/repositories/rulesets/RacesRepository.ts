import { and, eq, inArray, isNull } from "drizzle-orm";

import { racesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { RulesetEntityFilters } from "@/server/repositories/BaseRepository.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class RacesRepository extends RulesetEntityRepository<typeof racesInRules> {
  constructor() {
    super(racesInRules, "races");
  }

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.racesInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findManyByRulesetId(
    db: Db,
    where: RulesetEntityFilters<{ kind?: string }>,
    pagination: { limit: number; page: number },
  ) {
    const { search, kind, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.racesInRules.findMany({
        where: this.where([
          rulesetCondition,
          isNull(this.table.deletedAt),
          kind !== undefined && eq(this.table.kind, kind),
          searchConditions,
        ]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.racesInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
    });
  }
}

export default RacesRepository;
