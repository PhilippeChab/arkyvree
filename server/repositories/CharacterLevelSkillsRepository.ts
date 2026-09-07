import { and, eq, isNull, inArray, not, or, sql } from "drizzle-orm";

import { charactersInCharacter, levelSkillsInCharacter, levelsInCharacter, rulesetsInRules, skillsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterLevelSkillsRepository
  extends BaseRepository<typeof levelSkillsInCharacter, CharacterLevelSkillInstance> {
  constructor() {
    super(levelSkillsInCharacter);
  }

  async create(
    db: Db,
    values: InferInsertModel<typeof levelSkillsInCharacter> | InferInsertModel<typeof levelSkillsInCharacter>[],
  ) {
    if (Array.isArray(values)) {
      if (values.length === 0) return [];
      return await db.insert(this.table).values(values).returning();
    }
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof levelSkillsInCharacter>>,
    where: { characterLevelId: string; skillId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterLevelId, where.characterLevelId),
          this.idMatches(this.table.skillId, where.skillId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async deleteByCharacterLevelId(db: Db, where: { characterLevelId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.characterLevelId, where.characterLevelId));
  }

  // Cascade from character archive/unarchive
  async archive(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .returning();
  }

  async unarchive(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), not(isNull(this.table.deletedAt))))
      .returning();
  }

  async findOne(db: Db, where: { characterLevelId: string; skillId: string }) {
    return await db.query.levelSkillsInCharacter.findFirst({
      where: and(
        eq(this.table.characterLevelId, where.characterLevelId),
        this.idMatches(this.table.skillId, where.skillId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async existsBySkillId(db: Db, where: { skillId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.skillId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, levelsInCharacter.characterId))
      .innerJoin(rulesetsInRules, and(
        eq(rulesetsInRules.id, charactersInCharacter.rulesetId),
        or(
          eq(rulesetsInRules.id, where.rulesetId),
          sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
          sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
        ),
      ))
      .where(and(eq(this.table.skillId, where.skillId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsBySkillPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowSkillIds: string[] },
  ) {
    const skillCondition = where.shadowSkillIds.length > 0
      ? or(eq(skillsInRules.rulesetId, where.extensionRulesetId), inArray(skillsInRules.id, where.shadowSkillIds))
      : eq(skillsInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.skillId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, levelsInCharacter.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
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

  withInstance(instance: InferSelectModel<typeof levelSkillsInCharacter>) {
    return new CharacterLevelSkillInstance(instance);
  }
}

class CharacterLevelSkillInstance extends Instance<InferSelectModel<typeof levelSkillsInCharacter>> {}

export default CharacterLevelSkillsRepository;
