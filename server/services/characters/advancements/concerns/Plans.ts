import { type AdvancementPlanRequest, Engine, type EntityRecord, type StepPickerQuery } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { Entities, type Pagination } from "@/server/repositories/index.ts";
import { withRowEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The advancement wizards' plans, by their steps' mechanics: an advancement's steps, the plan's answer (each step's,
 * Add Level's plan and Edit Level's advancement alike), and a step's options over the plan, a page at a time, read by
 * the kind its picker opens (a plan's tracks, a pool's options, or a group's).
 */
export function Plans<B extends Constructor>(Base: B) {
  abstract class WithPlans extends Base {
    /** A saved advancement as an edit's plan opens it: each step's payload as the advancement saved it. */
    async getAdvancementPlan(session: Session, characterId: string, advancementId: string) {
      return await withRowEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).advancements().describeSavedPlan(advancementId),
      );
    }

    /** The plan's answer: each step's, in its mechanic's shape, and the plan's advancements. */
    async getPlan(session: Session, characterId: string, request: AdvancementPlanRequest) {
      return await withRowEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).advancements().describePlan(request),
      );
    }

    /**
     * An advancement's steps, in the wizard's order, each its mechanic's (an edit's, of saved advancement
     * `editedAdvancementId`, without its plan step), and the words advancements take. Refused when the character
     * has no such advancement.
     */
    async getPlanSteps(session: Session, characterId: string, editedAdvancementId?: string) {
      return await withRowEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).advancements().listSteps(editedAdvancementId),
      );
    }

    /**
     * A page of step `step`'s options over the plan (`query`), searched, read as its picker says: the tracks the plan
     * can take next (3.5's classes), a pool's options, or its groups (a group's own options when the query names one),
     * each described for the character with the plan as a step's option in no game's nouns (`StepOption`,
     * `StepOptionGroup`). Answered with whether its rows are groups.
     */
    async getStepOptions(
      session: Session,
      characterId: string,
      step: string,
      query: StepPickerQuery & { search?: string },
      pagination: Pagination,
    ) {
      const { search, ...picker } = query;
      return await withRowEditableCharacter(db, session, characterId, async (scope, character) => {
        const opened = Engine.for(scope).character(character).advancements().openStepPicker(step, picker);
        const { baseRules } = scope.ruleset;
        switch (opened.read) {
          // Tracks: its kind's rows in the character's ruleset, those its picker lists first (`firstIds`)
          case "tracks": {
            const filters = {
              entityType: opened.kind,
              rulesetId: character.record.rulesetId,
              ...scope.rulesetData.cow.listFilters,
              ...opened.picker.filters,
              search,
              searchFields: opened.searchFields,
            };
            const result = await Entities.findPage<EntityRecord & { name: string }>(db, baseRules, filters, pagination);
            const items = opened.picker.describeOptions(result.items);
            return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
          }
          case "groups": {
            const filters = {
              entityType: opened.kind,
              ...opened.picker.groupFilters,
              search,
              searchFields: opened.searchFields,
            };
            const result = await Entities.findOptionGroupPage(db, baseRules, filters, pagination);
            const items = opened.picker.describeGroups(result.items);
            return { grouped: true as const, items, page: result.page, nextPage: result.nextPage };
          }
          case "options": {
            const filters = {
              entityType: opened.kind,
              ...opened.picker.filters,
              search,
              searchFields: opened.searchFields,
            };
            const result = await Entities.findOptionPage(db, baseRules, filters, pagination);
            const items = opened.picker.describeOptions(result.items);
            return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
          }
        }
      });
    }
  }
  return WithPlans;
}
