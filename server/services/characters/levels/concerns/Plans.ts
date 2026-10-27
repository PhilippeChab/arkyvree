import {
  Engine,
  type EntityRecord,
  type LevelPlanRequest,
  type StepOption,
  type StepOptionGroup,
  type StepPickerQuery,
} from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { Entities, type Pagination } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

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
 * opens (a plan's tracks, a pool's options, or a group's).
 */
export function Plans<B extends Constructor>(Base: B) {
  abstract class WithPlans extends Base {
    /** A saved level as an edit's plan opens it: each step's payload as the level saved it. */
    async getLevelPlan(session: Session, characterId: string, advancementId: string) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().describeSavedPlan(advancementId),
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
     * A page of step `step`'s options over the plan (`query`), searched: the tracks the plan can take next (3.5's
     * classes), a pool's options (its groups, a group's own when the query names one), each described for the
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
        // A plan's picker reads tracks: its kind's rows in the character's ruleset, those it advanced on first
        if ("tracks" in opened.picker) {
          const filters = {
            entityType: opened.kind,
            rulesetId: character.record.rulesetId,
            ...scope.rulesetData.cow.listFilters,
            orderByAdvancementsOf: characterId,
            ...opened.picker.filters,
            search,
          };
          const result = await Entities.findPage<EntityRecord & { name: string }>(db, filters, pagination);
          const items = opened.picker
            .describe(result.items)
            .map((row): StepOption => ({ ...optionOf(row), track: row.track }));
          return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
        }
        // A grouped picker's groups, unless the query names one: its options then, as an ungrouped picker's
        if ("groupFilters" in opened.picker && picker.group === undefined) {
          const filters = { ...opened.picker.groupFilters, search };
          const result = await Entities.findOptionGroupPage(db, { entityType: opened.kind, ...filters }, pagination);
          const items = opened.picker.describeGroups(result.items).map((row): StepOptionGroup => ({
            count: row.variantCount,
            description: row.description,
            eligible: row.eligible,
            group: row.group,
            id: row.representativeId,
            name: row.displayName,
            ...(row.requirementTree && { requirementTree: row.requirementTree }),
          }));
          return { grouped: true as const, items, page: result.page, nextPage: result.nextPage };
        }
        const result = await Entities.findOptionPage(
          db,
          { entityType: opened.kind, ...opened.picker.filters, search },
          pagination,
        );
        const items = opened.picker.describe(result.items).map(optionOf);
        return { grouped: false as const, items, page: result.page, nextPage: result.nextPage };
      });
    }
  }
  return WithPlans;
}
