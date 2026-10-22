/**
 * A character's levels: the level-up wizard's steps (`Steps`), pickers (`Pickers`) and preview, a level's choices read
 * whole (`Choices`), a saved level's selections, and a level's save, edit and removal. Each reads the character's rows
 * and asks the engine, which answers by the character's ruleset; a save writes what the engine plans, with what the
 * character's bonded creatures become.
 */

import { getTableName } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { levelsInCharacter } from "@/drizzle/schema.ts";
import { type AbilityIncrease, Engine, type LevelRequest, type PreviewRequest } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterLevelAbilityIncreases,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Visibility,
} from "@/server/repositories/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { lockEditableCharacter, withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { writeBondedCreatures } from "./bondedWrites.ts";
import { Choices } from "./concerns/Choices.ts";
import { Pickers } from "./concerns/Pickers.ts";
import { Steps } from "./concerns/Steps.ts";
import { createLevelRows } from "./levelRows.ts";

class CharacterLevelsService extends include(Object, Choices, Pickers, Steps) {
  /** Deletes a level's rows in the tables under it, which an edit writes again. */
  private async deleteLevelRows(tx: Db, characterLevelId: string) {
    await CharacterLevelAbilityIncreases.delete(tx, { characterLevelId });
    await CharacterLevelFeats.delete(tx, { characterLevelId });
    await CharacterLevelPowers.delete(tx, { characterLevelId });
    await CharacterLevelSkills.delete(tx, { characterLevelId });
  }

  /**
   * Saves a level-up's levels, the character's pooled picks (skills, feats, powers) spread over them, and what its
   * bonded creatures become: the engine checks each level, and the character with them unless `force`d, and the save
   * writes what it plans.
   */
  async finalizeLevelUp(
    session: Session,
    characterId: string,
    levels: LevelRequest[],
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
    force: boolean = false,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const bonded = await readBondedInputs(tx, character);
        const plan = Engine.for(scope)
          .character(character)
          .levelUp()
          .planLevels(bonded, { levels, picks: { skills, feats, powers } }, force);
        const createdLevels = [];
        for (const { columns, rows } of plan.levels) {
          const [created] = await CharacterLevels.create(tx, { characterId, ...columns });
          createdLevels.push(created);
          await createLevelRows(tx, created.id, rows);
        }
        await writeBondedCreatures(tx, characterRecord, plan.bonded);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(levelsInCharacter),
          type: "addLevel",
          data: { count: levels.length },
        });

        return createdLevels;
      });
    });
  }

  /** A saved level's selections, as its edit opens them: its class level, hit points, ability increases and picks. */
  async getLevel(session: Session, characterId: string, characterLevelId: string) {
    // Visibility.All: an archived character's levels still read, read-only
    return await withEditableCharacter(
      db,
      session,
      characterId,
      (scope, character) => Engine.for(scope).character(character).levelUp().describeLevel(characterLevelId),
      Visibility.All,
    );
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`, each with its ability increases): the
   * pools they merge, each level's skill points, how the picks spread over them, and what the skill points spent so
   * far (`skills`, by skill, in the form's order) come to.
   */
  async getPreview(
    session: Session,
    characterId: string,
    levels: PreviewRequest["levels"],
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
  ) {
    return await withEditableCharacter(db, session, characterId, (scope, character) =>
      Engine.for(scope).character(character).levelUp().describePreview({ levels, picks: { feats, powers, skills } }),
    );
  }

  /**
   * Removes the character's most recent level, with its rows under it (the database deletes them with it), and what its
   * bonded creatures become without it.
   */
  async removeLevel(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await lockEditableCharacter(tx, session, characterId);

      await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const bonded = await readBondedInputs(tx, character);
        const removal = Engine.for(scope).character(character).levelUp().planRemoval(bonded);
        await CharacterLevels.delete(tx, { id: removal.level.id });
        await writeBondedCreatures(tx, characterRecord, removal.bonded);
      });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(levelsInCharacter),
        type: "removeLevel",
      });

      return { success: true };
    });
  }

  /**
   * Re-saves a character level with new hit points, ability increases and picks: the engine checks them, and refuses the
   * issues the level answers for unless `force`d. Answers the level as it was saved before.
   */
  async updateLevel(
    session: Session,
    characterId: string,
    characterLevelId: string,
    hp: number,
    abilityIncreases: AbilityIncrease[],
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
    force: boolean = false,
    expectedUpdatedAt?: string,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        // A level saved since its edit read it is refused before its edit is checked against it: the character's lock
        // keeps it as read until the write
        const saved = character.rows.levels.find((level) => level.id === characterLevelId);
        if (expectedUpdatedAt && saved && saved.updatedAt !== expectedUpdatedAt)
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        const bonded = await readBondedInputs(tx, character);
        const edit = Engine.for(scope)
          .character(character)
          .levelUp()
          .planEdit(bonded, characterLevelId, { abilityIncreases, feats, hp, powers, skills }, force);

        await CharacterLevels.update(tx, edit.columns, { id: characterLevelId });
        await this.deleteLevelRows(tx, characterLevelId);
        await createLevelRows(tx, characterLevelId, edit.rows);
        await writeBondedCreatures(tx, characterRecord, edit.bonded);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(levelsInCharacter),
          type: "editLevel",
        });

        return edit.level;
      });
    });
  }
}

export default new CharacterLevelsService();
