import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import { klassLevelsInRules, levelsInCharacter, levelSkillsInCharacter, skillsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { type RulesetEntityFilters } from "@/server/repositories/concerns/ScopesToRuleset.ts";
import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";

class SkillsRepository extends RulesetEntityRepository<typeof skillsInRules> {
  constructor() {
    super(skillsInRules);
  }

  protected readonly entityType = "skills";

  async findMany(db: Db, where: { ids: string[] }) {
    return await db.query.skillsInRules.findMany({
      where: and(inArray(this.table.id, where.ids), isNull(this.table.deletedAt)),
      orderBy: [this.orderBy(this.table.name)],
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; rulesetId: string } | { name: string; rulesetId: string },
  ) {
    return await db.query.skillsInRules.findFirst({
      where: this.where([
        "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
        "id" in where && eq(this.table.id, where.id),
        "name" in where && eq(this.table.name, where.name),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findPage(db: Db, where: RulesetEntityFilters, pagination: { limit: number; page: number }) {
    const { search, orderBy = "name", orderDir = "asc" } = where;
    const searchColumns = [this.table.name, this.table.description];
    const searchConditions = this.fuzzySearch(search, searchColumns);

    const rulesetCondition = this.buildRulesetCondition(db, where);

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.skillsInRules.findMany({
        where: this.where([rulesetCondition, isNull(this.table.deletedAt), searchConditions]),
        orderBy: this.searchOrderBy(search, searchColumns, this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async findPicks(db: Db, where: { characterLevelIds: string[] }) {
    return await db
      .select({
        ...getTableColumns(skillsInRules),
        klassLevelId: klassLevelsInRules.id,
        characterLevelId: levelsInCharacter.id,
        rank: levelSkillsInCharacter.rank,
      })
      .from(skillsInRules)
      .innerJoin(levelSkillsInCharacter, eq(skillsInRules.id, levelSkillsInCharacter.skillId))
      .innerJoin(levelsInCharacter, eq(levelSkillsInCharacter.characterLevelId, levelsInCharacter.id))
      .innerJoin(klassLevelsInRules, eq(levelsInCharacter.klassLevelId, klassLevelsInRules.id))
      .where(
        and(inArray(levelSkillsInCharacter.characterLevelId, where.characterLevelIds), isNull(skillsInRules.deletedAt)),
      );
  }
}

export default SkillsRepository;
