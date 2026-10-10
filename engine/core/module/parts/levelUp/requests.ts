/**
 * What the level-up part's operations take, past the rows the server read and the view: a level-up and a saved level's
 * edit as the wizard sends them, the preview's levels, a step's and a picker's query, what the wizard plans so far.
 * Whether to force the rules is always an operation's last argument.
 */

import type { AbilityIncrease, FeatPick } from "./plans.ts";

/** A feat picker's query: a level's pool, and a family's feats when it names one. */
export type FeatPickQuery = PickQuery & { family?: string };

/** A saved level's edit, as the form sends it: its new hit points, ability increases and picks. */
export type LevelEditRequest = LevelPicks & { abilityIncreases: AbilityIncrease[]; hp: number };

/** A level's picks, as a form sends them: its skill ranks, and its feats and powers by the pool they're picked in. */
export interface LevelPicks {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/**
 * The level a level-up wizard's step or picker is for, as the wizard asks for it: class `klassId`'s `level` (a step that
 * reads the level's class refuses to answer without them) and its ability increases, after the levels the wizard plans
 * before it (`planned`), or in the place of the saved level it edits (`editedLevelId`), and what the wizard picked at
 * it so far (`picks`), which a step says what it comes to.
 */
export interface LevelQuery {
  abilityIncreases?: AbilityIncrease[];
  editedLevelId?: string;
  klassId?: string;
  level?: number;
  picks?: Partial<LevelPicks>;
  planned?: PlannedSoFar;
}

/** A level a level-up writes, as the wizard sends it: its class's level, hit points and ability increases. */
export interface LevelRequest {
  abilityIncreases: AbilityIncrease[];
  hp: number;
  klassId: string;
  level: number;
}

/** A level-up, as the wizard sends it: its levels, and its picks, which the rules spread over them. */
export interface LevelUpRequest {
  levels: LevelRequest[];
  picks: LevelPicks;
}

/** A feat's or a power's picker query: a level, its class's, and the pool it picks in (`aptitudeId`). */
export type PickQuery = LevelQuery & { aptitudeId: string; klassId: string; level: number };

/**
 * What the level-up wizard plans before the level a step or a picker is for, not saved yet: its levels (their class
 * levels, and their ability increases by place), and the feats and skill points picked over them so far.
 */
export interface PlannedSoFar {
  abilityIncreases?: AbilityIncrease[][];
  featPicks?: FeatPick[];
  klassLevelIds?: string[];
  skillPoints?: Record<string, number>;
}

/** A power picker's query: a level's pool, of a spell level when given, less the powers picked so far. */
export type PowerPickQuery = PickQuery & { powerLevel?: number; selectedPowerIds?: string[] };

/** The level-up wizard's preview: the levels it plans, each with its ability increases, and what it picked so far. */
export interface PreviewRequest {
  levels: Omit<LevelRequest, "hp">[];
  picks?: Partial<LevelPicks>;
}
