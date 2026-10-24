/**
 * A character's levels: the level wizards' steps, plans and pickers (`Plans`), and a level's save, edit and removal.
 * Each reads the character's rows and asks the engine, which answers by the character's ruleset; a save writes what
 * the engine plans, with what the character's bonded creatures become.
 */

import type { Db } from "@/drizzle/database.ts";
import { type CharacterInput, Engine, type LevelPlanRequest, type LevelUpEngine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { Activities, CharacterLevels, Characters, Picks } from "@/server/repositories/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/characterInputs.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { writeChildren } from "./childWrites.ts";
import { Plans } from "./concerns/Plans.ts";
import { createLevelRows } from "./levelRows.ts";

class CharacterLevelsService extends include(Object, Plans) {
  /** Deletes a level's picks, which an edit writes again. */
  private async deleteLevelRows(tx: Db, characterLevelId: string) {
    await Picks.delete(tx, { characterLevelId });
  }

  /**
   * Re-saves character level `characterLevelId` as its edit plans it (`planOf`, from the character's level flows and
   * its bonded creatures): the level's columns, its rows under it in place of those it had, what its bonded creatures
   * become, and an activity. Answers the level as it was saved before.
   */
  private async editLevel(
    session: Session,
    characterId: string,
    characterLevelId: string,
    planOf: (levelUp: LevelUpEngine, children: CharacterInput[]) => ReturnType<LevelUpEngine["planLevelEdit"]>,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await this.lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const children = await readChildInputs(tx, character);
        const edit = planOf(Engine.for(scope).character(character).levelUp(), children);

        await CharacterLevels.update(tx, edit.columns, { id: characterLevelId });
        await this.deleteLevelRows(tx, characterLevelId);
        await createLevelRows(tx, characterLevelId, edit.rows);
        await writeChildren(tx, characterRecord, edit.children);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: "levels",
          type: "editLevel",
        });

        return edit.level;
      });
    });
  }

  /**
   * The character the session may edit, locked until the transaction ends: its level flows run one at a time, so each
   * reads the levels the one before saved, and the level it adds goes after them (`CharacterLevels.create`).
   */
  private async lockEditableCharacter(tx: Db, session: Session, characterId: string) {
    const characterRecord = await getEditableCharacter(tx, session, characterId);
    await Characters.lock(tx, { id: characterRecord.id });
    return characterRecord;
  }

  /**
   * Saves the levels a level-up plans (`planOf`, from the character's level flows and its bonded creatures): each level
   * and its rows under it, what the bonded creatures become, and an activity. Answers the levels saved.
   */
  private async saveLevels(
    session: Session,
    characterId: string,
    planOf: (levelUp: LevelUpEngine, children: CharacterInput[]) => ReturnType<LevelUpEngine["planLevelUp"]>,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await this.lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const children = await readChildInputs(tx, character);
        const plan = planOf(Engine.for(scope).character(character).levelUp(), children);
        const createdLevels = [];
        for (const { columns, rows } of plan.levels) {
          const [created] = await CharacterLevels.create(tx, { ...columns, characterId });
          createdLevels.push(created);
          await createLevelRows(tx, created.id, rows);
        }
        await writeChildren(tx, characterRecord, plan.children);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: "levels",
          type: "addLevel",
          data: { count: plan.levels.length },
        });

        return createdLevels;
      });
    });
  }

  /**
   * Saves a level-up's plan (`request`): its levels, its picks spread over them, and what the character's bonded
   * creatures become. The engine reads the plan by its steps, checks each level, and the character with them unless
   * `force`d, and the save writes what it plans.
   */
  async addLevels(session: Session, characterId: string, request: LevelPlanRequest, force: boolean = false) {
    return await this.saveLevels(session, characterId, (levelUp, children) =>
      levelUp.planLevelUp(children, request, force),
    );
  }

  /**
   * Removes the character's most recent level, with its rows under it (the database deletes them with it), and what its
   * bonded creatures become without it.
   */
  async removeLevel(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await this.lockEditableCharacter(tx, session, characterId);

      await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const children = await readChildInputs(tx, character);
        const removal = Engine.for(scope).character(character).levelUp().planRemoval(children);
        await CharacterLevels.delete(tx, { id: removal.level.id });
        await writeChildren(tx, characterRecord, removal.children);
      });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: "levels",
        type: "removeLevel",
      });

      return { success: true };
    });
  }

  /**
   * Re-saves a character level by an edit's plan (`request`): its hit points, ability increases and picks, read by an
   * edit's steps. The engine checks them, and refuses the issues the level answers for unless `force`d. Answers the
   * level as it was saved before.
   */
  async updatePlannedLevel(
    session: Session,
    characterId: string,
    characterLevelId: string,
    request: LevelPlanRequest,
    force: boolean = false,
  ) {
    return await this.editLevel(session, characterId, characterLevelId, (levelUp, children) =>
      levelUp.planLevelEdit(children, characterLevelId, request, force),
    );
  }
}

export default new CharacterLevelsService();
