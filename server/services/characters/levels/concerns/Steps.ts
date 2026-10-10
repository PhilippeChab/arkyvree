import { Engine, type LevelStep, type PlannedSoFar } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The level a step is for, as the wizard's query sends it: class `classId`'s `level` with its ability increases, after
 * the levels it plans before it (their class levels and ability increases), or a saved level's edit (`editedLevelId`),
 * and the skill points spent and the feats and powers picked at it so far (`skillPoints`, `featPicks`, `powerPicks`).
 */
interface StepQuery {
  abilityIncreases?: LevelStep["abilityIncreases"];
  classId?: string;
  editedLevelId?: string;
  featPicks?: { aptitudeId: string; featId: string }[];
  level?: number;
  plannedAbilityIncreases?: PlannedSoFar["abilityIncreases"];
  plannedClassLevelIds?: string[];
  powerPicks?: { aptitudeId: string; powerId: string }[];
  skillPoints?: Record<string, number>;
}

/** Picks by the pool they're picked in, each pool's in their order: `ids` of `pairs`, their pool's `aptitudeId`. */
function byPool(pairs: { aptitudeId: string; id: string }[] = []) {
  const pools: Record<string, string[]> = {};
  for (const { aptitudeId, id } of pairs) (pools[aptitudeId] ??= []).push(id);
  return pools;
}

/** The step's level as the engine takes it. */
function stepOf({
  classId,
  featPicks,
  plannedAbilityIncreases,
  plannedClassLevelIds,
  powerPicks,
  skillPoints,
  ...step
}: StepQuery): LevelStep {
  const planned = { abilityIncreases: plannedAbilityIncreases, klassLevelIds: plannedClassLevelIds };
  const picks = {
    feats: byPool(featPicks?.map(({ aptitudeId, featId }) => ({ aptitudeId, id: featId }))),
    powers: byPool(powerPicks?.map(({ aptitudeId, powerId }) => ({ aptitudeId, id: powerId }))),
    skills: skillPoints,
  };
  return { ...step, klassId: classId, picks, planned };
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
