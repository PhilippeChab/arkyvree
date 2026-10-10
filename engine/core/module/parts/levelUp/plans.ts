/**
 * What the level-up part's `plan*` operations answer: what the server writes of a level-up, a saved level's edit, a
 * level's removal and the bonded creatures, each a named plan, by table, without ids it doesn't have yet.
 */

import type { CharacterRows } from "@/engine/core/module/CharacterInputs.ts";
import type { AbilityScore } from "@/engine/core/module/parts/characters/index.ts";
import type { Character } from "@/shared/relations.ts";

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
export interface FeatPick {
  aptitudeId: string;
  featId: string;
}

/** A level's row, as a level-up writes it beside its character's: its class level and hit points. */
export interface LevelColumns {
  hp: number;
  klassLevelId: string;
}

/**
 * What a saved level's edit writes, checked: the level as saved (`level`), its row's new columns and its rows under it
 * in place of those it had, and what the bonded creatures become.
 */
export interface LevelEditPlan extends BondedCreaturesPlan, LevelWrites<Omit<LevelColumns, "klassLevelId">> {
  level: CharacterRows["levels"][number];
}

/** A level's picks as the rows a level-up writes: its feats and powers, each in its pool, and its skill ranks. */
export interface LevelPickRows {
  feats: FeatPick[];
  powers: PowerPick[];
  skills: SkillRank[];
}

/** What removing a character's last level writes: the level that goes, and what its bonded creatures become. */
export interface LevelRemovalPlan extends BondedCreaturesPlan {
  level: CharacterRows["levels"][number];
}

/** A level's rows in the tables under it, by table, as a level-up writes them: its ability increases and its picks. */
export interface LevelRows extends LevelPickRows {
  abilityIncreases: AbilityIncrease[];
}

/** What a level-up writes, checked: each level's writes, and what the master's bonded creatures become. */
export interface LevelsPlan extends BondedCreaturesPlan {
  levels: LevelWrites[];
}

/**
 * What a level-up writes of a level: its row's columns (`columns`, `C`), and its rows in the tables under it (`rows`),
 * by table. The server writes each as it is.
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
  abilities: AbilityScore[];
  row: Pick<
    Character,
    "alignment" | "gender" | "kind" | "name" | "parentCharacterId" | "raceId" | "rulesetId" | "userId" | "xp"
  >;
}

/** A power picked in a pool. */
export interface PowerPick {
  aptitudeId: string;
  powerId: string;
}

/** A skill's ranks a level buys. */
export interface SkillRank {
  rank: number;
  skillId: string;
}
