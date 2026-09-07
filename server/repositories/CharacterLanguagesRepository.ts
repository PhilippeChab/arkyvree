import { and, eq, inArray, isNull, not, or, sql } from "drizzle-orm";

import { charactersInCharacter, languagesInCharacter, languagesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CharacterLanguagesRepository
  extends BaseRepository<typeof languagesInCharacter, CharacterLanguageInstance> {
  constructor() {
    super(languagesInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof languagesInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof languagesInCharacter>>,
    where: { characterId: string; languageId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          this.idMatches(this.table.languageId, where.languageId),
        ),
      )
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

  // Exception to soft-delete: character languages are disposable reference data
  async delete(db: Db, where: { characterId: string; languageId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          this.idMatches(this.table.languageId, where.languageId),
        ),
      );
  }

  async existsByLanguageId(db: Db, where: { languageId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.languageId })
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
      .where(and(eq(this.table.languageId, where.languageId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByLanguagePickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowLanguageIds: string[] },
  ) {
    const langCondition = where.shadowLanguageIds.length > 0
      ? or(eq(languagesInRules.rulesetId, where.extensionRulesetId), inArray(languagesInRules.id, where.shadowLanguageIds))
      : eq(languagesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.languageId })
      .from(this.table)
      .innerJoin(charactersInCharacter, and(
        eq(charactersInCharacter.id, this.table.characterId),
        eq(charactersInCharacter.rulesetId, where.hostRulesetId),
      ))
      .innerJoin(languagesInRules, eq(languagesInRules.id, this.table.languageId))
      .where(langCondition)
      .limit(1);
    return rows.length > 0;
  }

  async findOne(db: Db, where: { characterId: string; languageId: string }) {
    return await db.query.languagesInCharacter.findFirst({
      where: and(
        eq(this.table.characterId, where.characterId),
        eq(this.table.languageId, where.languageId),
      ),
    });
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.languagesInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
    });
  }

  withInstance(instance: InferSelectModel<typeof languagesInCharacter>) {
    return new CharacterLanguageInstance(instance);
  }
}

class CharacterLanguageInstance extends Instance<InferSelectModel<typeof languagesInCharacter>> {}

export default CharacterLanguagesRepository;
