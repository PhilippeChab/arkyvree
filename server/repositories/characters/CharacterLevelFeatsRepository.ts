import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import {
  aptitudesInRules,
  charactersInCharacter,
  featsInRules,
  levelFeatsInCharacter,
  levelsInCharacter,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

class CharacterLevelFeatsRepository extends include(
  BaseRepository<typeof levelFeatsInCharacter>,
  ChecksRulesetUse,
  ResolvesCopies,
) {
  constructor() {
    super(levelFeatsInCharacter);
  }

  async existsByAptitudeId(db: Db, where: { aptitudeId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.aptitudeId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, levelsInCharacter.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.aptitudeId, where.aptitudeId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  async existsByAptitudePickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowAptitudeIds: string[] },
  ) {
    const aptCondition =
      where.shadowAptitudeIds.length > 0
        ? or(
            eq(aptitudesInRules.rulesetId, where.extensionRulesetId),
            inArray(aptitudesInRules.id, where.shadowAptitudeIds),
          )
        : eq(aptitudesInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.aptitudeId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, levelsInCharacter.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, this.table.aptitudeId))
      .where(and(isNull(this.table.deletedAt), aptCondition))
      .limit(1);
    return rows.length > 0;
  }

  async existsByFeatId(db: Db, where: { featId: string; rulesetId: string }) {
    const rows = await db
      .select({ id: this.table.featId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, levelsInCharacter.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(this.table.featId, where.featId), isNull(this.table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // Archived characters count — see `project_archive_preserves_picks` memory.
  async existsByFeatPickFromExtension(
    db: Db,
    where: { hostRulesetId: string; extensionRulesetId: string; shadowFeatIds: string[] },
  ) {
    const featCondition =
      where.shadowFeatIds.length > 0
        ? or(eq(featsInRules.rulesetId, where.extensionRulesetId), inArray(featsInRules.id, where.shadowFeatIds))
        : eq(featsInRules.rulesetId, where.extensionRulesetId);
    const rows = await db
      .select({ id: this.table.featId })
      .from(this.table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, this.table.characterLevelId))
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, levelsInCharacter.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(featsInRules, eq(featsInRules.id, this.table.featId))
      .where(and(isNull(this.table.deletedAt), featCondition))
      .limit(1);
    return rows.length > 0;
  }

  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    return await db.query.levelFeatsInCharacter.findMany({
      where: and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)),
    });
  }

  async createMany(db: Db, values: InferInsertModel<typeof levelFeatsInCharacter>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async deleteByCharacterLevelId(db: Db, where: { characterLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.characterLevelId, where.characterLevelId));
  }
}

export default CharacterLevelFeatsRepository;
