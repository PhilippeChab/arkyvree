import type { Character } from "@/shared/relations.ts";

import type { CharacterRows } from "./CharacterInputs.ts";

/** An ability a level raises, and by how much. */
export interface AbilityIncrease {
  abilityId: string;
  amount: number;
}

/** What a master's bonded creatures become: one plan per kind of creature its levels give it. */
export interface BondedCreaturesPlan {
  bonded: BondedPlan[];
}

/** The levels a bonded creature takes (their rows' columns), and the ids of those it loses. */
export interface BondedLevelsPlan {
  added: LevelColumns[];
  removedIds: string[];
}

/**
 * What a master's bonded creature of a kind (`kind`, the creature's character kind) becomes once the master's levels
 * change. Without one for the kind, the creature the master had goes (`removedId`). With one, the master keeps the
 * creature it has (`keptId`), or one is made (`created`) in place of the one it had; the creature kept or made takes or
 * loses `levels`.
 */
export type BondedPlan = { kind: string; removedId?: string } & (
  | { created: NewBondedCreature; levels: BondedLevelsPlan }
  | { keptId: string; levels: BondedLevelsPlan }
  | { levels: undefined }
);

/** A feat picked in a pool. */
export type FeatPick = { aptitudeId: string; featId: string };

/** A level's row, as a save writes it beside its character's: its class level and hit points. */
export interface LevelColumns {
  hp: number;
  klassLevelId: string;
}

/**
 * What a saved level's edit writes, checked: the level as saved (`level`), its row's new columns and its rows under it
 * in place of those it had, and what the bonded creatures become.
 */
export type LevelEditPlan = LevelWrites<Omit<LevelColumns, "klassLevelId">> & {
  bonded: BondedPlan[];
  level: CharacterRows["levels"][number];
};

/** A saved level's edit, as the form sends it: its new hit points, ability increases and picks. */
export type LevelEditRequest = LevelPicks & { abilityIncreases: AbilityIncrease[]; hp: number };

/** A level's picks as the rows a save writes. */
export interface LevelPickRows {
  feats: FeatPick[];
  powers: { aptitudeId: string; powerId: string }[];
  skills: { rank: number; skillId: string }[];
}

/** A level's picks: its skill ranks, and its feats and powers by the pool they're picked in. */
export interface LevelPicks {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/** What removing a character's last level writes: the level that goes, and what its bonded creatures become. */
export interface LevelRemovalPlan {
  bonded: BondedPlan[];
  level: CharacterRows["levels"][number];
}

/** A level a level-up saves, as the wizard sends it: its class's level, hit points and ability increases. */
export interface LevelRequest {
  abilityIncreases: AbilityIncrease[];
  hp: number;
  klassId: string;
  level: number;
}

/** A level's rows in the tables under it, by table, as a save writes them: its ability increases and its picks. */
export interface LevelRows extends LevelPickRows {
  abilityIncreases: AbilityIncrease[];
}

/** What a level-up saves, checked: each level's writes, and what the master's bonded creatures become. */
export interface LevelsPlan {
  bonded: BondedPlan[];
  levels: LevelWrites[];
}

/**
 * The level a level-up wizard's step is for, as the wizard asks for it: class `klassId`'s `level` (a step that reads the
 * level's class refuses to answer without them) and its ability increases, after the levels the wizard plans before
 * it (`planned`), or in the place of the saved level it edits (`editedLevelId`), and what the wizard picked at it so far
 * (`picks`), which the step says what it comes to.
 */
export interface LevelStep {
  abilityIncreases?: AbilityIncrease[];
  editedLevelId?: string;
  klassId?: string;
  level?: number;
  picks?: Partial<LevelPicks>;
  planned?: Pick<PlannedSoFar, "abilityIncreases" | "klassLevelIds">;
}

/**
 * What a save writes of a level: its row's columns (`columns`, `C`), and its rows in the tables under it (`rows`), by
 * table. The server writes each as it is.
 */
export interface LevelWrites<C = LevelColumns> {
  columns: C;
  rows: LevelRows;
}

/**
 * A bonded creature a plan makes: its character's row, whole (its master's, of its kind, its race and name, and what it
 * takes of its master), and its ability scores.
 */
export interface NewBondedCreature {
  abilities: { abilityId: string; score: number }[];
  row: Pick<
    Character,
    "alignment" | "gender" | "kind" | "name" | "parentCharacterId" | "raceId" | "rulesetId" | "userId" | "xp"
  >;
}

/**
 * The level a feat or a power is picked at: class `klassId`'s `level` with its ability increases, in the pool
 * `aptitudeId`, after the levels the wizard plans before it (`planned`), or a saved level's (`editedLevelId`), which a
 * pick sees the character as it was before.
 */
export interface PickLevel {
  abilityIncreases?: AbilityIncrease[];
  aptitudeId: string;
  editedLevelId?: string;
  klassId: string;
  level: number;
  planned?: PlannedSoFar;
}

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

/** A level-up wizard's step, as its ruleset lists it: its name, which the ruleset answers the step by, and its label. */
export interface WizardStep<N extends string = string> {
  label: string;
  name: N;
}
