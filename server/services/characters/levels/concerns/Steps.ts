import { Engine, type LevelStep } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The level a step is for, as the wizard's query sends it: class `classId`'s `level` with its ability increase, after
 * the levels it plans before it (their class levels and ability increases), or a saved level's edit (`editedLevelId`).
 */
interface StepQuery {
  abilityId?: string;
  classId?: string;
  editedLevelId?: string;
  level?: number;
  plannedAbilityIds?: (string | undefined)[];
  plannedClassLevelIds?: string[];
}

/** The step's level as the engine takes it. */
function stepOf({ classId, plannedAbilityIds, plannedClassLevelIds, ...step }: StepQuery): LevelStep {
  return { ...step, klassId: classId, planned: { abilityIds: plannedAbilityIds, klassLevelIds: plannedClassLevelIds } };
}

/**
 * The level-up wizard's steps, which the character's ruleset lists and answers by name, for a new level after those it
 * plans or a saved level's edit.
 */
export function Steps<B extends Constructor>(Base: B) {
  abstract class WithSteps extends Base {
    /** The step `name` of the level the query is for: refused when the character's ruleset has no such step. */
    async getStep(session: Session, characterId: string, name: string, query: StepQuery) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().describeStep(name, stepOf(query)),
      );
    }

    /** The steps of the level the query is for, in the wizard's order: each by its name, and its label. */
    async getSteps(session: Session, characterId: string, query: StepQuery) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().describeSteps(stepOf(query)),
      );
    }
  }
  return WithSteps;
}
