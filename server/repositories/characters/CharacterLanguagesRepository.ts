import { and, eq, inArray, type InferInsertModel, isNull, or } from "drizzle-orm";

import { charactersInCharacter, languagesInCharacter, languagesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

class CharacterLanguagesRepository extends include(
  BaseRepository<typeof languagesInCharacter>,
  ChecksRulesetUse,
  ResolvesCopies,
) {
  constructor() {
    super(languagesInCharacter);
  }

  private async existsLanguagePick(db: Db, where: { languageId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.languageId })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.languageId, where.languageId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count: one can be restored, and its picks must still resolve.
  private async existsLanguagePickFromExtension(
    db: Db,
    where: { extensionRulesetId: string; hostRulesetId: string; shadowLanguageIds: string[] },
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

  /**
   * Whether a character on the ruleset (or a descendant) picked the entity, or, with an extension, one of its entities:
   * an in-use check.
   */
  async exists(
    db: Db,
    where:
      | { languageId: string; rulesetId: string }
      | { extensionRulesetId: string; hostRulesetId: string; shadowLanguageIds: string[] },
  ): Promise<boolean> {
    if ("languageId" in where) return await this.existsLanguagePick(db, where);
    return await this.existsLanguagePickFromExtension(db, where);
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.languagesInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
    });
  }
}

export default CharacterLanguagesRepository;
