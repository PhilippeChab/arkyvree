import { and, eq, getTableColumns, inArray, isNull, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import {
  charactersInCharacter,
  levelsInCharacter,
  levelSkillsInCharacter,
  rulesetsInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

class CharacterLevelSkillsRepository extends include(
  BaseRepository<typeof levelSkillsInCharacter>,
  ChecksRulesetUse,
  ResolvesCopies,
) {
  constructor() {
    super(levelSkillsInCharacter);
  }

  private async existsSkillPick(db: Db, where: { skillId: string; rulesetId: string }) {
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

  // Archived characters count: one can be restored, and its picks must still resolve.
  private async existsSkillPickFromExtension(
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

  /**
   * Whether a character on the ruleset (or a descendant) picked the entity, or, with an extension, one of its entities:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { skillId: string; rulesetId: string }
      | { hostRulesetId: string; extensionRulesetId: string; shadowSkillIds: string[] },
  ): Promise<boolean> {
    if ("skillId" in where) return await this.existsSkillPick(db, where);
    return await this.existsSkillPickFromExtension(db, where);
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
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

  async createMany(db: Db, values: InferInsertModel<typeof levelSkillsInCharacter>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async delete(db: Db, where: { characterLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.characterLevelId, where.characterLevelId));
  }
}

export default CharacterLevelSkillsRepository;
