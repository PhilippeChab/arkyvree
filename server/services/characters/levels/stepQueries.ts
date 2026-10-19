import type { LevelQuery, PlannedSoFar } from "@/engine/index.ts";

/**
 * The level a step is for, as the wizard's query sends it: class `classId`'s `level` with its ability increases, after
 * the levels it plans before it (their class levels and ability increases), or a saved level's edit (`editedLevelId`),
 * and the skill points spent and the feats and powers picked at it so far (`skillPoints`, `featPicks`, `powerPicks`).
 */
export interface StepQuery {
  abilityIncreases?: LevelQuery["abilityIncreases"];
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

/** A step's query as the engine takes it: its level, what the wizard plans before it, and what it picked so far. */
export function toLevelQuery({
  classId,
  featPicks,
  plannedAbilityIncreases,
  plannedClassLevelIds,
  powerPicks,
  skillPoints,
  ...step
}: StepQuery): LevelQuery {
  const planned = { abilityIncreases: plannedAbilityIncreases, klassLevelIds: plannedClassLevelIds };
  const picks = {
    feats: byPool(featPicks?.map(({ aptitudeId, featId }) => ({ aptitudeId, id: featId }))),
    powers: byPool(powerPicks?.map(({ aptitudeId, powerId }) => ({ aptitudeId, id: powerId }))),
    skills: skillPoints,
  };
  return { ...step, klassId: classId, picks, planned };
}
