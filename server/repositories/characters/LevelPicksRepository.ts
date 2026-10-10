import { and, eq, inArray, type InferInsertModel, isNull, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import {
  type aptitudesInRules,
  charactersInCharacter,
  type featsInRules,
  type levelAbilityIncreasesInCharacter,
  type levelFeatsInCharacter,
  type levelPowersInCharacter,
  levelsInCharacter,
  type levelSkillsInCharacter,
  type powersInRules,
  rulesetsInRules,
  type skillsInRules,
} from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { ChecksRulesetUse } from "@/server/repositories/concerns/ChecksRulesetUse.ts";
import { ResolvesCopies } from "@/server/repositories/concerns/ResolvesCopies.ts";

type LevelPickTable =
  | typeof levelAbilityIncreasesInCharacter
  | typeof levelSkillsInCharacter
  | typeof levelFeatsInCharacter
  | typeof levelPowersInCharacter;

/** What a pick names: a skill, a feat, a power, or the aptitude a feat or a power is picked under. */
type PickedTable = typeof skillsInRules | typeof featsInRules | typeof powersInRules | typeof aptitudesInRules;

/** What a level's picks' repository includes: the in-use checks' ruleset join, with copy-on-write ids. */
const LevelPicksBase = include(BaseRepository, ChecksRulesetUse, ResolvesCopies);

/** A level's picks (skills, feats, powers): their in-use checks, their bulk insert and their delete. */
abstract class LevelPicksRepository<T extends LevelPickTable> extends LevelPicksBase<T> {
  // Through the concerns, `table` reads as `Table & T`: its own type is T.
  declare protected readonly table: T;

  /** Whether a character on the ruleset (or a descendant) picked one of `ids` in `column`: an in-use check. */
  protected async existsPick(db: Db, column: PgColumn, where: { ids: string[]; rulesetId: string }) {
    const table: LevelPickTable = this.table;
    const rows = await db
      .select({ id: column })
      .from(table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, table.characterLevelId))
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, levelsInCharacter.characterId))
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(and(this.idMatches(column, where.ids), isNull(table.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Whether a character on the host ruleset picked, in `column`, a row of `picked` the extension holds or shadows.
   * Archived characters count: one can be restored, and its picks must still resolve.
   */
  protected async existsPickFromExtension(
    db: Db,
    column: PgColumn,
    picked: PickedTable,
    where: { extensionRulesetId: string; hostRulesetId: string; shadowIds: string[] },
  ) {
    const pickedCondition =
      where.shadowIds.length > 0
        ? or(eq(picked.rulesetId, where.extensionRulesetId), inArray(picked.id, where.shadowIds))
        : eq(picked.rulesetId, where.extensionRulesetId);
    const table: LevelPickTable = this.table;
    const rows = await db
      .select({ id: column })
      .from(table)
      .innerJoin(levelsInCharacter, eq(levelsInCharacter.id, table.characterLevelId))
      .innerJoin(
        charactersInCharacter,
        and(
          eq(charactersInCharacter.id, levelsInCharacter.characterId),
          eq(charactersInCharacter.rulesetId, where.hostRulesetId),
        ),
      )
      .innerJoin(picked, eq(picked.id, column))
      .where(and(isNull(table.deletedAt), pickedCondition))
      .limit(1);
    return rows.length > 0;
  }

  async createMany(db: Db, values: InferInsertModel<T>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async delete(db: Db, where: { characterLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.characterLevelId, where.characterLevelId));
  }
}

export default LevelPicksRepository;
