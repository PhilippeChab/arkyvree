/**
 * A character's levels: the level wizards' steps, plans and pickers (`Plans`), and a level's save, edit and removal.
 * Each reads the character's rows and asks the engine, which answers by the character's ruleset; a save writes what
 * the engine plans, with what the character's children (3.5's bonded creatures) become.
 */

import { type CharacterInput, Engine, type LevelPlanRequest, type LevelUpEngine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { Activities, CharacterAdvancements } from "@/server/repositories/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/characterInputs.ts";
import { withCharacterWrite } from "@/server/services/characters/characterWrites.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

import { createAdvancement, updateAdvancement } from "./advancementWrites.ts";
import { writeChildren } from "./childWrites.ts";
import { Plans } from "./concerns/Plans.ts";

class CharacterLevelsService extends include(Object, Plans) {
  /**
   * Re-saves a character's level as its edit plans it (`planOf`, from the character's level flows and its children):
   * its advancement's picks in place of those it had, what its children become, and an activity. Answers the
   * advancement as it was saved before.
   */
  private async editLevel(
    session: Session,
    characterId: string,
    planOf: (levelUp: LevelUpEngine, children: CharacterInput[]) => ReturnType<LevelUpEngine["planLevelEdit"]>,
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      const children = await readChildInputs(tx, character);
      const edit = planOf(Engine.for(scope).character(character).levelUp(), children);

      await updateAdvancement(tx, edit);
      await writeChildren(tx, characterRecord, edit.children);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "editLevel",
      });

      return edit.advancement;
    });
  }

  /**
   * Saves the levels a level-up plans (`planOf`, from the character's level flows and its children): each advancement
   * and its picks, what the children become, and an activity. Answers the advancements saved.
   */
  private async saveLevels(
    session: Session,
    characterId: string,
    planOf: (levelUp: LevelUpEngine, children: CharacterInput[]) => ReturnType<LevelUpEngine["planLevelUp"]>,
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      const children = await readChildInputs(tx, character);
      const plan = planOf(Engine.for(scope).character(character).levelUp(), children);
      const created = [];
      for (const advancement of plan.advancements) created.push(await createAdvancement(tx, characterId, advancement));
      await writeChildren(tx, characterRecord, plan.children);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "addLevel",
        data: { count: plan.advancements.length },
      });

      return created;
    });
  }

  /**
   * Saves a level-up's plan (`request`): its levels, its picks spread over them, and what the character's children
   * become. The engine reads the plan by its steps, checks each level, and the character with them unless `force`d, and
   * the save writes what it plans.
   */
  async addLevels(session: Session, characterId: string, request: LevelPlanRequest, force: boolean = false) {
    return await this.saveLevels(session, characterId, (levelUp, children) =>
      levelUp.planLevelUp(children, request, force),
    );
  }

  /**
   * Removes the character's most recent level, its advancement with its picks (the database deletes them with it), and
   * what its children become without it.
   */
  async removeLevel(session: Session, characterId: string) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      const children = await readChildInputs(tx, character);
      const removal = Engine.for(scope).character(character).levelUp().planRemoval(children);
      await CharacterAdvancements.delete(tx, { id: removal.advancement.id });
      await writeChildren(tx, characterRecord, removal.children);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "removeLevel",
      });

      return { success: true };
    });
  }

  /**
   * Re-saves a character level by an edit's plan (`request`): its hit points, ability increases and picks, read by an
   * edit's steps. The engine checks them, and refuses the issues the level answers for unless `force`d. Answers the
   * level's advancement as it was saved before.
   */
  async updatePlannedLevel(
    session: Session,
    characterId: string,
    advancementId: string,
    request: LevelPlanRequest,
    force: boolean = false,
  ) {
    return await this.editLevel(session, characterId, (levelUp, children) =>
      levelUp.planLevelEdit(children, advancementId, request, force),
    );
  }
}

export default new CharacterLevelsService();
