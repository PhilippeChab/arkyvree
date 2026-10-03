import { and, eq, getTableColumns, inArray, isNull, or, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import {
  charactersInCharacter,
  klassesInRules,
  klassLevelsInRules,
  levelsInCharacter,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

class CharacterLevelsRepository extends include(
  BaseRepository<typeof levelsInCharacter>,
  ChecksRulesetUse,
  ResolvesCopies,
) {
  constructor() {
    super(levelsInCharacter);
  }

  private async existsKlassLevelPick(db: Db, where: { klassLevelId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.klassLevelId, where.klassLevelId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  private async existsKlassPick(db: Db, where: { klassId: string; rulesetId: string }) {
    const result = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(klassLevelsInRules, eq(this.table.klassLevelId, klassLevelsInRules.id))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(klassLevelsInRules.klassId, where.klassId), isNull(this.table.deletedAt)))
      .limit(1);
    return result.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  private async existsKlassPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowKlassIds: string[] },
  ) {
    const klassCondition =
      where.shadowKlassIds.length > 0
        ? or(eq(klassesInRules.rulesetId, where.extensionRulesetId), inArray(klassesInRules.id, where.shadowKlassIds))
        : eq(klassesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, this.table.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(klassLevelsInRules, eq(klassLevelsInRules.id, this.table.klassLevelId))
      .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
      .where(and(isNull(this.table.deletedAt), klassCondition))
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
      | { klassId: string; rulesetId: string }
      | { klassLevelId: string; rulesetId: string }
      | { hostRulesetId: string; extensionRulesetId: string; shadowKlassIds: string[] },
  ): Promise<boolean> {
    if ("klassId" in where) return await this.existsKlassPick(db, where);
    if ("klassLevelId" in where) return await this.existsKlassLevelPick(db, where);
    return await this.existsKlassPickFromExtension(db, where);
  }

  async findHighestCharacterLevel(db: Db, where: { characterId: string }) {
    const result = await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .innerJoin(klassLevelsInRules, eq(this.table.klassLevelId, klassLevelsInRules.id))
      .where(and(eq(this.table.characterId, where.characterId), isNull(this.table.deletedAt)))
      .orderBy(this.orderBy(this.table.createdAt, "desc"), this.orderBy(klassLevelsInRules.level, "desc"))
      .limit(1);

    return result[0];
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

  async create(db: Db, values: InferInsertModel<typeof levelsInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof levelsInCharacter>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  // Intentional removal — hard delete
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }
}

export default CharacterLevelsRepository;
