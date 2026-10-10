import { Engine, type LevelStep, type PlannedSoFar } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The level a step is for, as the wizard's query sends it: class `classId`'s `level` with its ability increases, after
 * the levels it plans before it (their class levels and ability increases), or a saved level's edit (`editedLevelId`),
 * and the skill points spent at it so far (`skillPoints`).
 */
interface StepQuery {
  abilityIncreases?: LevelStep["abilityIncreases"];
  classId?: string;
  editedLevelId?: string;
  level?: number;
  plannedAbilityIncreases?: PlannedSoFar["abilityIncreases"];
  plannedClassLevelIds?: string[];
  skillPoints?: Record<string, number>;
}

/** The step's level as the engine takes it. */
function stepOf({
  classId,
  plannedAbilityIncreases,
  plannedClassLevelIds,
  skillPoints,
  ...step
}: StepQuery): LevelStep {
  const planned = { abilityIncreases: plannedAbilityIncreases, klassLevelIds: plannedClassLevelIds };
  return { ...step, klassId: classId, picks: { skills: skillPoints }, planned };
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
