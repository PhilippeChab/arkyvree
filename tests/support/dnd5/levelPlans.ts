/**
 * D&D 5th Edition level plans, as the level wizards send them, from the levels and picks the tests name: a level-up's
 * class levels with their hit points, an edit's level, and their feats' and spells' picks. And a saved level's plan read
 * back by kind, as the tests check it.
 */

import type { AdvancementPlanRequest } from "@/engine/index.ts";

/** An answer's payload of `step`, as the save sends it. */
type Payload = AdvancementPlanRequest["steps"][string];

/**
 * A level a level-up plans: its class, the level in it the test expects it to take (a plan names its class alone, the
 * engine numbers it: `expectSavedLevels` checks a save's) and its hit points.
 */
export interface PlannedClassLevel {
  classId: string;
  hp: number;
  level: number;
}

/** A plan's picks, by id: the feats and spells picked in each pool. */
export interface PlanPicks {
  feats?: Record<string, string[]>;
  spells?: Record<string, string[]>;
}

/** A saved level's plan, read by kind: its hit points and its picks. */
export interface SavedPicks {
  feats: Record<string, string[]>;
  hp: number | undefined;
  spells: Record<string, string[]>;
}

/** A pick step's payload by pool: its ids, in order. */
function byPool(payload: Payload | undefined) {
  const pools: Record<string, string[]> = {};
  for (const { id, pool } of (payload ?? []) as { id: string; pool: string }[]) (pools[pool] ??= []).push(id);
  return pools;
}

/** The picks as the feats and spells steps' payloads: each pool's picks in it, in order. */
function picksOf({ feats = {}, spells = {} }: PlanPicks) {
  const picked = (pools: Record<string, string[]>) =>
    Object.entries(pools).flatMap(([pool, ids]) => ids.map((id) => ({ id, pool })));
  return { feats: picked(feats), spells: picked(spells) };
}

/** An edit's plan of its level: its hit points and its picks. */
export function levelEditPlan(hp: number, picks: PlanPicks = {}): AdvancementPlanRequest {
  return { steps: { hp: [hp], ...picksOf(picks) } };
}

/** A level-up's plan: its class levels, in order, each with its hit points, and its picks. */
export function levelUpPlan(levels: PlannedClassLevel[], picks: PlanPicks = {}): AdvancementPlanRequest {
  return {
    steps: {
      "class-plan": levels.map(({ classId }) => ({ track: classId })),
      hp: levels.map(({ hp }) => hp),
      ...picksOf(picks),
    },
  };
}

/** A saved level's plan (`plan`), read by kind. */
export function savedPicksOf(plan: AdvancementPlanRequest): SavedPicks {
  const [hp] = (plan.steps.hp ?? []) as number[];
  return { feats: byPool(plan.steps.feats), hp, spells: byPool(plan.steps.spells) };
}
