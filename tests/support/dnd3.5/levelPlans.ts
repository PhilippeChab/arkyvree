/**
 * 3.5 level plans, as the level wizards send them, from the levels and picks the tests name: a level-up's class levels
 * with their hit points and ability increases, an edit's level, and their skills', feats' and spells' picks. And a saved
 * level's plan read back by kind, as the tests check it.
 */

import type { LevelPlanRequest } from "@/engine/index.ts";

/** An answer's payload of `step`, as the save sends it. */
type Payload = LevelPlanRequest["steps"][string];

/** A level a level-up plans: its class, its level in it, its hit points and its ability increases. */
export interface PlannedClassLevel {
  abilityIncreases?: { abilityId: string; amount: number }[];
  classId: string;
  hp: number;
  level: number;
}

/** A plan's picks, by id: the points spent on each skill, and the feats and spells picked in each pool. */
export interface PlanPicks {
  feats?: Record<string, string[]>;
  skills?: Record<string, number>;
  spells?: Record<string, string[]>;
}

/** A saved level's plan, read by kind: its hit points, its ability increases, and its picks. */
export interface SavedPicks {
  abilityIncreases: { abilityId: string; amount: number }[];
  feats: Record<string, string[]>;
  hp: number | undefined;
  skills: Record<string, number>;
  spells: Record<string, string[]>;
}

/** A pick step's payload by pool: its ids, in order. */
function byPool(payload: Payload | undefined) {
  const pools: Record<string, string[]> = {};
  for (const { id, pool } of (payload ?? []) as { id: string; pool: string }[]) (pools[pool] ??= []).push(id);
  return pools;
}

/** A level's ability increases as a `choose` payload's options. */
function chosenOf(increases: PlannedClassLevel["abilityIncreases"] = []) {
  return increases.map(({ abilityId, amount }) => ({ amount, id: abilityId }));
}

/** The picks as the skills, feats and spells steps' payloads: each pool's picks in it, in order. */
function picksOf({ feats = {}, spells = {}, skills = {} }: PlanPicks) {
  const picked = (byPool: Record<string, string[]>) =>
    Object.entries(byPool).flatMap(([pool, ids]) => ids.map((id) => ({ id, pool })));
  return {
    skills: Object.entries(skills).map(([id, points]) => ({ id, points })),
    feats: picked(feats),
    spells: picked(spells),
  };
}

/** An edit's plan of its level: its hit points, its ability increases and its picks. */
export function levelEditPlan(
  { abilityIncreases, hp }: Omit<PlannedClassLevel, "classId" | "level">,
  picks: PlanPicks = {},
): LevelPlanRequest {
  return { steps: { hp: [hp], abilities: [chosenOf(abilityIncreases)], ...picksOf(picks) } };
}

/** A level-up's plan: its class levels, in order, each with its hit points and ability increases, and its picks. */
export function levelUpPlan(levels: PlannedClassLevel[], picks: PlanPicks = {}): LevelPlanRequest {
  return {
    steps: {
      "class-plan": levels.map(({ classId, level }) => ({ position: level, track: classId })),
      hp: levels.map(({ hp }) => hp),
      abilities: levels.map(({ abilityIncreases }) => chosenOf(abilityIncreases)),
      ...picksOf(picks),
    },
  };
}

/** A saved level's plan (`plan`), read by kind. */
export function savedPicksOf(plan: LevelPlanRequest): SavedPicks {
  const [hp] = (plan.steps.hp ?? []) as number[];
  const [chosen = []] = (plan.steps.abilities ?? []) as { amount: number; id: string }[][];
  const spent = (plan.steps.skills ?? []) as { id: string; points: number }[];
  return {
    abilityIncreases: chosen.map(({ amount, id }) => ({ abilityId: id, amount })),
    feats: byPool(plan.steps.feats),
    hp,
    spells: byPool(plan.steps.spells),
    skills: Object.fromEntries(spent.map(({ id, points }) => [id, points])),
  };
}
