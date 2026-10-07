import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import {
  klassLevelsInRules,
  levelPowersInCharacter,
  levelsInCharacter,
  powersInRules,
  savesInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class PowersRepository extends include(RulesetEntityRepository<typeof powersInRules>, ResolvesCopies) {
  constructor() {
    super(powersInRules);
  }

  protected readonly entityType = "powers";

  async findMany(db: Db, where: { ids: string[] }) {
    if (where.ids.length === 0) return [];
    return await db.query.powersInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.powersInRules.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "name" in where && eq(this.table.name, where.name)],
        ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId), isNull(this.table.deletedAt)],
      ),
      with: {
        powersAptitudesInRules: {
          orderBy: (links) => [this.orderBy(links.createdAt), this.orderBy(links.aptitudeId)],
          with: {
            aptitudesInRule: true,
          },
        },
        savesInRule: true,
      },
    });
  }

  /** A picker's page of these spells (a list's, as the ruleset composes it), by name. */
  async findOptionPage(
    db: Db,
    where: { excludePowerIds?: string[]; ids: string[]; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const { ids, excludePowerIds, search } = where;
    const { limit, offset } = this.paginate(pagination);
    const rows = await db
      .select({
        id: powersInRules.id,
        name: powersInRules.name,
        description: powersInRules.description,
      })
      .from(powersInRules)
      .where(
        this.where([
          inArray(powersInRules.id, ids),
          isNull(powersInRules.deletedAt),
          this.search(search, [powersInRules.name]),
          this.excludeIds(excludePowerIds),
        ]),
      )
      .orderBy(...this.pageOrder(this.orderBy(powersInRules.name)))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findPage(db: Db, where: RulesetEntityFilters<{ ids?: string[] }>, pagination: { limit: number; page: number }) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated([], pagination);
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.powersInRules.findMany({
          where: this.where([
            rulesetCondition,
            isNull(this.table.deletedAt),
            searchConditions,
            where.ids !== undefined && inArray(this.table.id, where.ids),
          ]),
          orderBy: this.pageOrder(
            this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
          ),
          with: {
            powersAptitudesInRules: {
              orderBy: (links) => [this.orderBy(links.createdAt), this.orderBy(links.aptitudeId)],
              with: {
                aptitudesInRule: true,
              },
            },
            savesInRule: true,
          },
          limit,
          offset,
        }),
    );
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findPicks(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select({
        ...getTableColumns(powersInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        aptitudeId: levelPowersInCharacter.aptitudeId,
        saveName: savesInRules.name,
      })
      .from(powersInRules)
      .innerJoin(levelPowersInCharacter, eq(powersInRules.id, levelPowersInCharacter.powerId))
      .innerJoin(levelsInCharacter, eq(levelPowersInCharacter.characterLevelId, levelsInCharacter.id))
      .innerJoin(klassLevelsInRules, eq(levelsInCharacter.klassLevelId, klassLevelsInRules.id))
      .leftJoin(savesInRules, eq(powersInRules.saveId, savesInRules.id))
      .where(
        and(inArray(levelPowersInCharacter.characterLevelId, where.characterLevelIds), isNull(powersInRules.deletedAt)),
      )
      .orderBy(
        this.orderBy(powersInRules.name),
        this.orderBy(powersInRules.id),
        this.orderBy(levelPowersInCharacter.aptitudeId),
        this.orderBy(levelsInCharacter.id),
      );
  }
}

export default PowersRepository;
