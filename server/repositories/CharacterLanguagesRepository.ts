import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { charactersInCharacter, languagesInCharacter, languagesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class CharacterLanguagesRepository extends BaseRepository<typeof languagesInCharacter> {
  constructor() {
    super(languagesInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof languagesInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: character languages are disposable reference data
  async delete(db: Db, where: { characterId: string; languageId: string }) {
    return await db
      .delete(this.table)
      .where(
        and(eq(this.table.characterId, where.characterId), this.idMatches(this.table.languageId, where.languageId)),
      );
  }

  async existsByLanguageId(db: Db, where: { languageId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.languageId })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.languageId, where.languageId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByLanguagePickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowLanguageIds: string[] },
  ) {
    const langCondition =
      where.shadowLanguageIds.length > 0
        ? or(
            eq(languagesInRules.rulesetId, where.extensionRulesetId),
            inArray(languagesInRules.id, where.shadowLanguageIds),
          )
        : eq(languagesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.languageId })
      .from(this.table)
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, this.table.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(languagesInRules, eq(languagesInRules.id, this.table.languageId))
      .where(langCondition)
      .limit(1);
    return rows.length > 0;
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.languagesInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
    });
  }
}

export default CharacterLanguagesRepository;
