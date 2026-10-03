import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import {
  charactersInCharacter,
  levelsInCharacter,
  levelSkillsInCharacter,
  rulesetsInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class CharacterLevelSkillsRepository extends BaseRepository<typeof levelSkillsInCharacter> {
  constructor() {
    super(levelSkillsInCharacter);
  }

  async createMany(db: Db, values: InferInsertModel<typeof levelSkillsInCharacter>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async deleteByCharacterLevelId(db: Db, where: { characterLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.characterLevelId, where.characterLevelId));
  }

  async existsBySkillId(db: Db, where: { skillId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.skillId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, levelsInCharacter.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.skillId, where.skillId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsBySkillPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowSkillIds: string[] },
  ) {
    const skillCondition =
      where.shadowSkillIds.length > 0
        ? or(eq(skillsInRules.rulesetId, where.extensionRulesetId), inArray(skillsInRules.id, where.shadowSkillIds))
        : eq(skillsInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.skillId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, levelsInCharacter.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(skillsInRules, eq(skillsInRules.id, this.table.skillId))
      .where(and(isNull(this.table.deletedAt), skillCondition))
      .limit(1);
    return rows.length > 0;
  }

  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    return await db.query.levelSkillsInCharacter.findMany({
      where: and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)),
    });
  }
}

export default CharacterLevelSkillsRepository;
