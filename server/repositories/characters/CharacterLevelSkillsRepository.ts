import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { levelSkillsInCharacter, skillsInRules } from "@/drizzle/schema.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

class CharacterLevelSkillsRepository extends LevelPicksRepository<typeof levelSkillsInCharacter> {
  constructor() {
    super(levelSkillsInCharacter);
  }

  /**
   * Whether a character on the ruleset (or a descendant) picked the entity, or, with an extension, one of its entities:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { rulesetId: string; skillIds: string[] }
      | { extensionRulesetId: string; hostRulesetId: string; shadowSkillIds: string[] },
  ): Promise<boolean> {
    const { table } = this;
    if ("skillIds" in where)
      return await this.existsPick(db, table.skillId, { ids: where.skillIds, rulesetId: where.rulesetId });
    return await this.existsPickFromExtension(db, table.skillId, skillsInRules, {
      ...where,
      shadowIds: where.shadowSkillIds,
    });
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .leftJoin(skillsInRules, eq(skillsInRules.id, this.table.skillId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(skillsInRules.name),
        this.orderBy(this.table.skillId),
        this.orderBy(this.table.characterLevelId),
      );
  }
}

export default CharacterLevelSkillsRepository;
