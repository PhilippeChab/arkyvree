import type { CharacterRows } from "./CharacterInputs.ts";

/** What a master's bonded creatures become: one plan per kind of creature its levels give it. */
export interface BondedCreaturesPlan {
  bonded: BondedPlan[];
}

/** The levels a bonded creature takes, and the ids of those it loses. */
export interface BondedLevelsPlan {
  added: { abilityId: null; hp: number; klassLevelId: string }[];
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

/** What a saved level's edit writes, checked: the level, its new hit points, ability and picks, and the bonded creatures. */
export type LevelEditPlan = LevelPickRows & {
  abilityId: string | null;
  bonded: BondedPlan[];
  hp: number;
  level: CharacterRows["levels"][number];
};

/** A saved level's edit, as the form sends it: its new hit points, ability increase and picks. */
export type LevelEditRequest = LevelPicks & { abilityId: string | null; hp: number };

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

/** A level a level-up saves, as the wizard sends it: its class's level, hit points and ability increase. */
export interface LevelRequest {
  abilityId: string | null;
  hp: number;
  klassId: string;
  level: number;
}

/** What a level-up saves, checked: each level's rows, and what the master's bonded creatures become. */
export interface LevelsPlan {
  bonded: BondedPlan[];
  levels: (LevelPickRows & { abilityId: string | null; hp: number; klassLevelId: string })[];
}

/**
 * A level-up wizard's step, as it asks for it: the step's level's ability increase, the levels the wizard plans before
 * it (`planned`), or the saved level it edits (`editedLevelId`), which the step's level takes the place of.
 */
export interface LevelStep {
  abilityId?: string;
  editedLevelId?: string;
  planned?: Pick<PlannedSoFar, "abilityIds" | "klassLevelIds">;
}

/** A bonded creature a plan makes: of a race, named for it, with its ability scores. */
export interface NewBondedCreature {
  abilities: { abilityId: string; score: number }[];
  name: string;
  raceId: string;
}

/**
 * The level a feat or a power is picked at: class `klassId`'s `level` with its ability increase (`abilityId`), in the
 * pool `aptitudeId`, after the levels the wizard plans before it (`planned`), or a saved level's (`editedLevelId`),
 * which a pick sees the character as it was before.
 */
export interface PickLevel {
  abilityId?: string;
  aptitudeId: string;
  editedLevelId?: string;
  klassId: string;
  level: number;
  planned?: PlannedSoFar;
}

/**
 * What the level-up wizard plans before the level a step or a picker is for, not saved yet: its levels (their class
 * levels, and their ability increases by place), and the feats and skill ranks picked over them so far.
 */
export interface PlannedSoFar {
  abilityIds?: (string | undefined)[];
  featPicks?: FeatPick[];
  klassLevelIds?: string[];
  skillRanks?: { rank: number; skillId: string }[];
}
