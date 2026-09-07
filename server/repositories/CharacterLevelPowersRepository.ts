import { and, eq, isNull, inArray, not, or, sql } from "drizzle-orm";

import { aptitudesInRules, charactersInCharacter, levelPowersInCharacter, levelsInCharacter, powersInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterLevelPowersRepository
  extends BaseRepository<typeof levelPowersInCharacter, CharacterLevelPowerInstance> {
  constructor() {
    super(levelPowersInCharacter);
  }

  async create(
    db: Db,
    values: InferInsertModel<typeof levelPowersInCharacter> | InferInsertModel<typeof levelPowersInCharacter>[],
  ) {
    if (Array.isArray(values)) {
      if (values.length === 0) return [];
      return await db.insert(this.table).values(values).returning();
    }
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof levelPowersInCharacter>>,
    where: { characterLevelId: string; powerId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterLevelId, where.characterLevelId),
          this.idMatches(this.table.powerId, where.powerId),
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

  async findOne(db: Db, where: { characterLevelId: string; powerId: string }) {
    return await db.query.levelPowersInCharacter.findFirst({
      where: and(
        eq(this.table.characterLevelId, where.characterLevelId),
        this.idMatches(this.table.powerId, where.powerId),
        isNull(this.table.deletedAt),
      ),
    });
  }

  async existsByPowerId(db: Db, where: { powerId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.powerId })
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
      .where(and(eq(this.table.powerId, where.powerId), isNull(this.table.deletedAt)))
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
  async existsByPowerPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowPowerIds: string[] },
  ) {
    const powerCondition = where.shadowPowerIds.length > 0
      ? or(eq(powersInRules.rulesetId, where.extensionRulesetId), inArray(powersInRules.id, where.shadowPowerIds))
      : eq(powersInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.powerId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, levelsInCharacter.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
      .innerJoin(powersInRules, eq(powersInRules.id, this.table.powerId))
      .where(and(isNull(this.table.deletedAt), powerCondition))
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
    return await db.query.levelPowersInCharacter.findMany({
      where: and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)),
    });
  }

  withInstance(instance: InferSelectModel<typeof levelPowersInCharacter>) {
    return new CharacterLevelPowerInstance(instance);
  }
}

class CharacterLevelPowerInstance extends Instance<InferSelectModel<typeof levelPowersInCharacter>> {}

export default CharacterLevelPowersRepository;
