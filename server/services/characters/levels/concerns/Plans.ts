import {
  Engine,
  type LevelPlanRequest,
  type StepOption,
  type StepOptionGroup,
  type StepPickerQuery,
} from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { Feats, Klasses, Powers } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** Which page of a step's options to read: how many a page holds, and its number. */
interface Pagination {
  limit: number;
  page: number;
}

/** An option described by its picker, as a step's option: its entity, and whether the character may take it. */
function optionOf(option: {
  description: string | null;
  eligible: boolean;
  id: string;
  name: string;
  requirementTree?: string;
}): StepOption {
  const { description, eligible, id, name, requirementTree } = option;
  return { description, eligible, id, name, ...(requirementTree && { requirementTree }) };
}

/**
 * The level wizards' plans, by their steps' mechanics: a level's steps, the plan's answer (each step's, Add Level's
 * plan and Edit Level's level alike), and a step's options over the plan, a page at a time, read by the kind its picker
 * opens (a class plan's classes, a pool's feats, a family's, or its spells).
 */
export function Plans<B extends Constructor>(Base: B) {
  abstract class WithPlans extends Base {
    /** A saved level as an edit's plan opens it: each step's payload as the level saved it. */
    async getLevelPlan(session: Session, characterId: string, characterLevelId: string) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().describeSavedPlan(characterLevelId),
      );
    }

    /** The plan's answer: each step's, in its mechanic's shape, and the plan's advancements. */
    async getPlan(session: Session, characterId: string, request: LevelPlanRequest) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().describePlan(request),
      );
    }

    /**
     * A level's steps, in the wizard's order, each its mechanic's (an edit's, of saved level `editedLevelId`,
     * without its plan step), and the words its advancements take. Refused when the character has no such level.
     */
    async getPlanSteps(session: Session, characterId: string, editedLevelId?: string) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().listSteps(editedLevelId),
      );
    }

    /**
     * A page of step `step`'s options over the plan (`query`), searched: the classes the plan can take next, a pool's
     * feats (their families grouped, a family's own when the query names one) or its spells, each described for the
     * character with the plan, each a step's option in no game's nouns (`StepOption`, `StepOptionGroup`). Answered
     * with whether its rows are groups.
     */
    async getStepOptions(
      session: Session,
      characterId: string,
      step: string,
      query: StepPickerQuery & { search?: string },
      pagination: Pagination,
    ) {
      const { search, ...picker } = query;
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const opened = Engine.for(scope).character(character).levelUp().openStepPicker(step, picker);
        switch (opened.kind) {
          case "feats": {
            if (picker.group === undefined) {
              const filters = { ...opened.picker.groupFilters, search };
              const result = await Feats.findOptionGroupPage(db, filters, pagination);
              const items = opened.picker.describeGroups(result.items).map((row): StepOptionGroup => ({
                count: row.variantCount,
                description: row.description,
                eligible: row.eligible,
                group: row.family,
                id: row.representativeId,
                name: row.displayName,
                ...(row.requirementTree && { requirementTree: row.requirementTree }),
              }));
              return { grouped: true as const, items, page: result.page, nextPage: result.nextPage };
            }
            const result = await Feats.findOptionPage(db, { ...opened.picker.filters, search }, pagination);
            const items = opened.picker.describe(result.items).map(optionOf);
            return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
          }
          case "klasses": {
            const filters = {
              rulesetId: character.record.rulesetId,
              ...scope.rulesetData.cow.listFilters,
              characterId,
              ...opened.picker.filters,
              search,
            };
            const result = await Klasses.findPage(db, filters, pagination);
            const items = opened.picker.describe(result.items).map((klass): StepOption => ({
              ...optionOf(klass),
              track: { last: klass.maxLevel, left: klass.levelsLeft, next: klass.nextLevel },
            }));
            return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
          }
          case "powers": {
            const result = await Powers.findOptionPage(db, { ...opened.picker.filters, search }, pagination);
            const items = opened.picker.describe(result.items).map(optionOf);
            return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
          }
          default: {
            // Every kind the module's pickers open has a page reader here: a new kind fails to compile until it has one
            const unread: never = opened;
            throw new Error(`No page reader for options of kind ${(unread as { kind: string }).kind}`);
          }
        }
      });
    }
  }
  return WithPlans;
}
