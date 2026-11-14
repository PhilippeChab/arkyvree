/**
 * A character's advancements: the advancement wizards' steps, plans and pickers (`Plans`), and an advancement's save,
 * edit and removal. Each reads the character's rows and asks the engine, which answers by the character's ruleset; a
 * save writes what the engine plans, with what the character's children (3.5's bonded creatures) become.
 */

import { type AdvancementPlanRequest, type AdvancementsEngine, type CharacterInput, Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, CharacterAdvancements } from "@/server/repositories/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/characterInputs.ts";
import { withCharacterWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

import { createAdvancement, updateAdvancement } from "./advancementWrites.ts";
import { writeChildren } from "./childWrites.ts";
import { Plans } from "./concerns/Plans.ts";

class CharacterAdvancementsService extends include(Object, Plans) {
  /**
   * Refuses a save from a page that read another last advancement than the character's (`lastAdvancementId`, its id, or
   * `null` when the page read none) as stale: another tab, or the same save sent again, added or removed a level since,
   * and the save would add one more or remove one the page never showed. Not given, nothing is checked (`/v1`, whose
   * callers may send none).
   */
  private refuseMovedLast(character: CharacterInput, lastAdvancementId: string | null | undefined) {
    if (lastAdvancementId === undefined) return;
    const last = character.rows.advancements.at(-1)?.id ?? null;
    if (last !== lastAdvancementId) throw new ConflictError(STALE_ENTITY_MESSAGE);
  }

  /**
   * Re-saves a character's advancement as its edit plans it (`planOf`, from the character's advancement flows and its
   * children): its advancement's picks in place of those it had, what its children become, and an activity. Answers the
   * advancement as it was saved before.
   */
  private async editAdvancement(
    session: Session,
    characterId: string,
    planOf: (
      advancements: AdvancementsEngine,
      children: CharacterInput[],
    ) => ReturnType<AdvancementsEngine["planAdvancementEdit"]>,
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      const children = await readChildInputs(tx, character);
      const edit = planOf(Engine.for(scope).character(character).advancements(), children);

      await updateAdvancement(tx, scope.ruleset.baseRules, edit);
      await writeChildren(tx, scope.ruleset.baseRules, edit.children);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "editAdvancement",
      });

      return edit.advancement;
    });
  }

  /**
   * Saves the advancements a plan takes (`planOf`, from the character's advancement flows and its children): each
   * advancement and its picks, what the children become, and an activity, refused as stale when the page read another
   * last advancement (`lastAdvancementId`, `refuseMovedLast`). Answers the advancements saved.
   */
  private async saveAdvancements(
    session: Session,
    characterId: string,
    lastAdvancementId: string | null | undefined,
    planOf: (
      advancements: AdvancementsEngine,
      children: CharacterInput[],
    ) => ReturnType<AdvancementsEngine["planAddition"]>,
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      this.refuseMovedLast(character, lastAdvancementId);
      const children = await readChildInputs(tx, character);
      const plan = planOf(Engine.for(scope).character(character).advancements(), children);
      const created = [];
      const { baseRules } = scope.ruleset;
      for (const advancement of plan.advancements)
        created.push(await createAdvancement(tx, baseRules, characterId, advancement));
      await writeChildren(tx, baseRules, plan.children);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "addAdvancement",
        data: { count: plan.advancements.length },
      });

      return created;
    });
  }

  /**
   * Saves a plan (`request`): its advancements, its picks spread over them, and what the character's
   * children become. The engine reads the plan by its steps, checks each advancement, and the character with them
   * unless `force`d, and the save writes what it plans. Refused as stale when the character's last advancement isn't
   * the one the page read (`lastAdvancementId`: `null` for none), so a save sent twice adds its levels once.
   */
  async addAdvancements(
    session: Session,
    characterId: string,
    request: AdvancementPlanRequest,
    force: boolean = false,
    lastAdvancementId?: string | null,
  ) {
    return await this.saveAdvancements(session, characterId, lastAdvancementId, (advancements, children) =>
      advancements.planAddition(children, request, force),
    );
  }

  /**
   * Removes the character's most recent advancement, with its picks (the database deletes them with it), and
   * what its children become without it. Refused as stale when it isn't the one the page showed last
   * (`advancementId`), so two pages' removals take one level.
   */
  async removeAdvancement(session: Session, characterId: string, advancementId?: string) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      this.refuseMovedLast(character, advancementId);
      const children = await readChildInputs(tx, character);
      const removal = Engine.for(scope).character(character).advancements().planRemoval(children);
      await CharacterAdvancements.delete(tx, { id: removal.advancement.id });
      await writeChildren(tx, scope.ruleset.baseRules, removal.children);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "removeAdvancement",
      });

      return { success: true };
    });
  }

  /**
   * Re-saves a character advancement by an edit's plan (`request`): its hit points, ability increases and picks, read
   * by an edit's steps. The engine checks them, and refuses the issues the advancement answers for unless `force`d.
   * Answers the advancement as it was saved before.
   */
  async updateSavedAdvancement(
    session: Session,
    characterId: string,
    advancementId: string,
    request: AdvancementPlanRequest,
    force: boolean = false,
  ) {
    return await this.editAdvancement(session, characterId, (advancements, children) =>
      advancements.planAdvancementEdit(children, advancementId, request, force),
    );
  }
}

export default new CharacterAdvancementsService();
