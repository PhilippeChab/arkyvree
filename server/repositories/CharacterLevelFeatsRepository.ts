import { and, eq, isNull, inArray, not, or, sql } from "drizzle-orm";

import { aptitudesInRules, charactersInCharacter, featsInRules, levelFeatsInCharacter, levelsInCharacter, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterLevelFeatsRepository
  extends BaseRepository<typeof levelFeatsInCharacter, CharacterLevelFeatInstance> {
  constructor() {
    super(levelFeatsInCharacter);
  }

  async create(
    db: Db,
    values: InferInsertModel<typeof levelFeatsInCharacter> | InferInsertModel<typeof levelFeatsInCharacter>[],
  ) {
    if (Array.isArray(values)) {
      if (values.length === 0) return [];
      return await db.insert(this.table).values(values).returning();
    }
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof levelFeatsInCharacter>>,
    where: { characterLevelId: string; featId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterLevelId, where.characterLevelId),
          this.idMatches(this.table.featId, where.featId),
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

  async findOne(db: Db, where: { characterLevelId: string; featId: string }) {
    return await db.query.levelFeatsInCharacter.findFirst({
      where: and(
        eq(this.table.characterLevelId, where.characterLevelId),
        eq(this.table.featId, where.featId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async existsByFeatId(db: Db, where: { featId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.featId })
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
      .where(and(eq(this.table.featId, where.featId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  async existsByAptitudeId(db: Db, where: { aptitudeId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.aptitudeId })
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
      .where(and(eq(this.table.aptitudeId, where.aptitudeId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByFeatPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowFeatIds: string[] },
  ) {
    const featCondition = where.shadowFeatIds.length > 0
      ? or(eq(featsInRules.rulesetId, where.extensionRulesetId), inArray(featsInRules.id, where.shadowFeatIds))
      : eq(featsInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.featId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, levelsInCharacter.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
      .innerJoin(featsInRules, eq(featsInRules.id, this.table.featId))
      .where(and(isNull(this.table.deletedAt), featCondition))
      .limit(1);
    return rows.length > 0;
  }

  async existsByAptitudePickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowAptitudeIds: string[] },
  ) {
    const aptCondition = where.shadowAptitudeIds.length > 0
      ? or(eq(aptitudesInRules.rulesetId, where.extensionRulesetId), inArray(aptitudesInRules.id, where.shadowAptitudeIds))
      : eq(aptitudesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.aptitudeId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, levelsInCharacter.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
      .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, this.table.aptitudeId))
      .where(and(isNull(this.table.deletedAt), aptCondition))
      .limit(1);
    return rows.length > 0;
  }

  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    return await db.query.levelFeatsInCharacter.findMany({
      where: and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)),
    });
  }

  withInstance(instance: InferSelectModel<typeof levelFeatsInCharacter>) {
    return new CharacterLevelFeatInstance(instance);
  }
}

class CharacterLevelFeatInstance extends Instance<InferSelectModel<typeof levelFeatsInCharacter>> {}

export default CharacterLevelFeatsRepository;
