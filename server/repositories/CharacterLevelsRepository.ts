import { and, desc, eq, getTableColumns, inArray, isNull, not, or, sql } from "drizzle-orm";

import { charactersInCharacter, klassLevelsInRules, klassesInRules, levelsInCharacter, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterLevelsRepository
  extends BaseRepository<typeof levelsInCharacter, CharacterLevelInstance> {
  constructor() {
    super(levelsInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof levelsInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof levelsInCharacter>>,
    where: { id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  // Cascade from character archive/unarchive
  async archive(db: Db, where: { characterId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)))
      .returning();
  }

  async unarchive(db: Db, where: { characterId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.characterId, where.characterId), not(isNull(this.table.deletedAt))))
      .returning();
  }

  // Intentional removal — hard delete
  async delete(db: Db, where: { id: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.id, where.id));
  }

  async existsByKlassLevelId(db: Db, where: { klassLevelId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, and(
        eq(rulesetsInRules.id, charactersInCharacter.rulesetId),
        or(
          eq(rulesetsInRules.id, where.rulesetId),
          sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
          sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
        ),
      ))
      .where(and(eq(this.table.klassLevelId, where.klassLevelId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  async existsByKlassId(db: Db, where: { klassId: string; rulesetId: string }) {
    const result = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(klassLevelsInRules, eq(this.table.klassLevelId, klassLevelsInRules.id))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, and(
        eq(rulesetsInRules.id, charactersInCharacter.rulesetId),
        or(
          eq(rulesetsInRules.id, where.rulesetId),
          sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
          sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${where.rulesetId}::uuid]`,
        ),
      ))
      .where(and(eq(klassLevelsInRules.klassId, where.klassId), isNull(this.table.deletedAt)))
      .limit(1);
    return result.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByKlassPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowKlassIds: string[] },
  ) {
    const klassCondition = where.shadowKlassIds.length > 0
      ? or(eq(klassesInRules.rulesetId, where.extensionRulesetId), inArray(klassesInRules.id, where.shadowKlassIds))
      : eq(klassesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, this.table.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
      .innerJoin(klassLevelsInRules, eq(klassLevelsInRules.id, this.table.klassLevelId))
      .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
      .where(and(isNull(this.table.deletedAt), klassCondition))
      .limit(1);
    return rows.length > 0;
  }

  async findOne(db: Db, where: { id: string } | { characterId: string; klassLevelId: string }) {
    return await db.query.levelsInCharacter.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "characterId" in where && eq(this.table.characterId, where.characterId),
        "klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findLast(db: Db, where: { characterId: string }) {
    return await db.query.levelsInCharacter.findFirst({
      where: and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)),
      orderBy: (levels, { desc }) => desc(levels.createdAt),
    });
  }

  async findHighestCharacterLevel(db: Db, where: { characterId: string }) {
    const result = await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .innerJoin(klassLevelsInRules, eq(this.table.klassLevelId, klassLevelsInRules.id))
      .where(and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)))
      .orderBy(desc(this.table.createdAt), desc(klassLevelsInRules.level))
      .limit(1);

    return result[0];
  }

  async findMaxKlassLevelsByCharacter(db: Db, where: { characterId: string }) {
    const result = await db
      .select({
        klassId: klassLevelsInRules.klassId,
        maxLevel: sql<number>`max(${klassLevelsInRules.level})`.mapWith(Number),
      })
      .from(this.table)
      .innerJoin(klassLevelsInRules, eq(this.table.klassLevelId, klassLevelsInRules.id))
      .where(and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)))
      .groupBy(klassLevelsInRules.klassId);

    return result;
  }

  async findMany(db: Db, where: { characterId: string } | { characterIds: string[] }) {
    return await db.query.levelsInCharacter.findMany({
      where: this.where([
        "characterId" in where && eq(this.table.characterId, where.characterId),
        "characterIds" in where && inArray(this.table.characterId, where.characterIds),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  withInstance(instance: InferSelectModel<typeof levelsInCharacter>) {
    return new CharacterLevelInstance(instance);
  }
}

class CharacterLevelInstance extends Instance<InferSelectModel<typeof levelsInCharacter>> {}

export default CharacterLevelsRepository;
