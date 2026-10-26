/**
 * What 3.5's level flows take, past the rows the server read and the view: a level-up and a saved level's edit as it
 * reads them from a plan (`readLevelUp`, `readEdit`), and the queries its steps and pickers answer over a plan (a
 * level's, what it plans before it, the levels its plan's answer reads). A level's ability increases, and the feats and
 * spells a plan picked so far, are picks by step, as a save writes them (`PickPlan`): an increase its `abilities` pick
 * (its ability and amount), a feat or a spell its `feats` or `spells` pick (its entity and pool).
 */

import type { PickPlan } from "@/engine/core/module/index.ts";

/** A level's picks, as a form sends them: its skill ranks, and its feats and spells by the pool they're picked in. */
export interface LevelPicks {
  feats: Record<string, string[]>;
  skills: Record<string, number>;
  spells: Record<string, string[]>;
}

/**
 * The level a module's step or picker answers for, read from a plan: class `klassId`'s `level` (a step that reads the
 * level's class refuses to answer without them) and its ability increases, after the levels the plan takes before it
 * (`planned`), or in the place of the saved level it edits (`editedLevelId`), and what the plan picked at it so far
 * (`picks`), which a step says what it comes to.
 */
export interface LevelQuery {
  abilityIncreases?: PickPlan[];
  editedLevelId?: string;
  klassId?: string;
  level?: number;
  picks?: Partial<LevelPicks>;
  planned?: PlannedSoFar;
}

/** A level a level-up writes, as a module reads it from a plan: its class's level, hit points and ability increases. */
export interface LevelRequest {
  abilityIncreases: PickPlan[];
  hp: number;
  klassId: string;
  level: number;
}

/** A level-up, as a module reads it from a plan: its levels, and its picks, which the rules spread over them. */
export interface LevelUpRequest {
  levels: LevelRequest[];
  picks: LevelPicks;
}

/**
 * What a plan takes before the level a step or a picker is for, not saved yet: its levels (their class levels, and
 * their ability increases by place), the feats and spells picked over them so far (`picks`, each in its pool), and
 * the skill points spent so far.
 */
export interface PlannedSoFar {
  abilityIncreases?: PickPlan[][];
  classLevelIds?: string[];
  picks?: PickPlan[];
  skillPoints?: Record<string, number>;
}

/** A plan's levels as its answer reads them: each with its ability increases, and what the plan picked so far. */
export interface PreviewRequest {
  levels: Omit<LevelRequest, "hp">[];
  picks?: Partial<LevelPicks>;
}

/** A feat picker's query: a level's pool, and a family's feats when it names one. */
export type FeatPickQuery = PickQuery & { family?: string };

/** A saved level's edit, as the form sends it: its new hit points, ability increases and picks. */
export type LevelEditRequest = LevelPicks & { abilityIncreases: PickPlan[]; hp: number };

/**
 * A feat's or a spell's picker query: a level, its class's, the pool it picks in (`aptitudeId`), and the levels the
 * plan takes after it (`laterClassLevelIds`, their class levels), whose grants the level can't pick.
 */
export type PickQuery = LevelQuery & {
  aptitudeId: string;
  klassId: string;
  laterClassLevelIds?: string[];
  level: number;
};

/** A spell picker's query: a level's pool, of a spell level when given. */
export type SpellPickQuery = PickQuery & { spellLevel?: number };
