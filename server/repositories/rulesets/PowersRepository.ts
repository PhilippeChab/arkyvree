import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import {
  klassLevelPowersInRules,
  klassLevelsInRules,
  levelPowersInCharacter,
  levelsInCharacter,
  powersAptitudesInRules,
  powersInRules,
  savesInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import { GrantsPerLevel } from "@/server/repositories/concerns/GrantsPerLevel.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class PowersRepository extends include(RulesetEntityRepository<typeof powersInRules>, ResolvesCopies, GrantsPerLevel) {
  constructor() {
    super(powersInRules);
  }

  protected readonly entityType = "powers";

  /**
   * The powers the character levels' class levels grant, each with its level (see `grantedAt`), by name, ties broken to
   * a fixed order.
   */
  async findGrants(db: Db, where: { levels: { id: string; klassLevelId: string }[] }) {
    if (where.levels.length === 0) return [];
    const granted = await db
      .select({
        ...getTableColumns(powersInRules),
        klassLevelId: klassLevelPowersInRules.klassLevelId,
        aptitudeId: klassLevelPowersInRules.aptitudeId,
        free: klassLevelPowersInRules.free,
        saveName: savesInRules.name,
        powerLevel: powersAptitudesInRules.level,
      })
      .from(powersInRules)
      .innerJoin(klassLevelPowersInRules, eq(powersInRules.id, klassLevelPowersInRules.powerId))
      .leftJoin(savesInRules, eq(powersInRules.saveId, savesInRules.id))
      .leftJoin(
        powersAptitudesInRules,
        and(
          eq(powersInRules.id, powersAptitudesInRules.powerId),
          eq(klassLevelPowersInRules.aptitudeId, powersAptitudesInRules.aptitudeId),
        ),
      )
      .where(
        and(
          inArray(klassLevelPowersInRules.klassLevelId, [...new Set(where.levels.map((level) => level.klassLevelId))]),
          isNull(powersInRules.deletedAt),
        ),
      )
      .orderBy(
        this.orderBy(powersInRules.name),
        this.orderBy(powersInRules.id),
        this.orderBy(klassLevelPowersInRules.aptitudeId),
        this.orderBy(klassLevelPowersInRules.klassLevelId),
      );
    return this.grantedAt(where.levels, granted);
  }

  async findMany(db: Db, where: { ids: string[] }) {
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
          with: {
            aptitudesInRule: true,
          },
        },
        savesInRule: true,
      },
    });
  }

  async findOptionPage(
    db: Db,
    where: {
      rulesetId: string;
      ancestorRulesetIds?: string[];
      aptitudeId: string;
      excludePowerIds?: string[];
      siblingLoserIds?: Iterable<string>;
      search?: string;
      powerLevel?: number;
    },
    pagination: { limit: number; page: number },
  ) {
    const { aptitudeId, excludePowerIds, siblingLoserIds, search, powerLevel } = where;
    const searchCondition = this.search(search, [powersInRules.name]);
    const { limit, offset } = this.paginate(pagination);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    const rows = await db
      .selectDistinctOn([powersInRules.name], {
        id: powersInRules.id,
        name: powersInRules.name,
        description: powersInRules.description,
      })
      .from(powersInRules)
      .innerJoin(powersAptitudesInRules, eq(powersInRules.id, powersAptitudesInRules.powerId))
      .where(
        this.where([
          rulesetCondition,
          isNull(powersInRules.deletedAt),
          isNull(powersInRules.campaignId),
          // A list's copies too: books seed their own copy of a list their spells are on, which a ruleset merges
          this.idMatches(powersAptitudesInRules.aptitudeId, aptitudeId),
          searchCondition,
          this.excludeIds(excludePowerIds),
          this.excludeIds(siblingLoserIds),
          ...(powerLevel != null ? [eq(powersAptitudesInRules.level, powerLevel)] : []),
        ]),
      )
      .orderBy(this.orderBy(powersInRules.name))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async findPage(
    db: Db,
    where: RulesetEntityFilters<{ aptitudeId?: string; level?: number }>,
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const aptitudeLevelCondition = where.aptitudeId
      ? inArray(
          this.table.id,
          db
            .select({ id: powersAptitudesInRules.powerId })
            .from(powersAptitudesInRules)
            .where(
              and(
                this.idMatches(powersAptitudesInRules.aptitudeId, where.aptitudeId),
                where.level != null ? eq(powersAptitudesInRules.level, where.level) : undefined,
              ),
            ),
        )
      : where.level != null
        ? inArray(
            this.table.id,
            db
              .select({ id: powersAptitudesInRules.powerId })
              .from(powersAptitudesInRules)
              .where(eq(powersAptitudesInRules.level, where.level)),
          )
        : false;

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.powersInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions, aptitudeLevelCondition]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        with: {
          powersAptitudesInRules: {
            with: {
              aptitudesInRule: true,
            },
          },
          savesInRule: true,
        },
        limit,
        offset,
      });
    });
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findPicks(db: Db, where: { characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(powersInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        aptitudeId: levelPowersInCharacter.aptitudeId,
        saveName: savesInRules.name,
        powerLevel: powersAptitudesInRules.level,
      })
      .from(powersInRules)
      .innerJoin(levelPowersInCharacter, eq(powersInRules.id, levelPowersInCharacter.powerId))
      .innerJoin(levelsInCharacter, eq(levelPowersInCharacter.characterLevelId, levelsInCharacter.id))
      .innerJoin(klassLevelsInRules, eq(levelsInCharacter.klassLevelId, klassLevelsInRules.id))
      .leftJoin(savesInRules, eq(powersInRules.saveId, savesInRules.id))
      .leftJoin(
        powersAptitudesInRules,
        and(
          eq(powersInRules.id, powersAptitudesInRules.powerId),
          eq(levelPowersInCharacter.aptitudeId, powersAptitudesInRules.aptitudeId),
        ),
      )
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
