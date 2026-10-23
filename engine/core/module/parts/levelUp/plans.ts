/**
 * What the level-up part's `plan*` operations answer: what the server writes of a level-up, a saved level's edit, a
 * level's removal and the bonded creatures, each a named plan, without ids it doesn't have yet. A level's row and the
 * rows under it are its module's, as its storage declaration writes them: its advancement's columns, and its picks by
 * the name the module declares each under.
 */

import type { CharacterRows } from "@/engine/core/module/CharacterInputs.ts";
import type { Character } from "@/shared/relations.ts";

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
 * What a saved level's edit writes, checked: the level as saved (`level`), its row's new columns (its value: a level
 * keeps its track) and its rows under it in place of those it had, and what the bonded creatures become.
 */
export interface LevelEditPlan extends BondedCreaturesPlan, LevelWrites {
  level: CharacterRows["levels"][number];
}

/** What removing a character's last level writes: the level that goes, and what its bonded creatures become. */
export interface LevelRemovalPlan extends BondedCreaturesPlan {
  level: CharacterRows["levels"][number];
}

/** What a level-up writes, checked: each level's writes, and what the master's bonded creatures become. */
export interface LevelsPlan extends BondedCreaturesPlan {
  levels: LevelWrites[];
}

/**
 * What a level-up writes of a level: its row's columns, and its rows under it, by pick. The server writes each as it
 * is.
 */
export interface LevelWrites {
  columns: LevelColumns;
  rows: LevelRows;
}

/**
 * A bonded creature a plan makes: its character's row, whole (its master's, of its kind, and what it takes of its
 * master), and its links, by the name its module declares each under (3.5's ability scores).
 */
export interface NewBondedCreature {
  links: Record<string, object[]>;
  row: Pick<
    Character,
    "alignment" | "gender" | "kind" | "name" | "parentCharacterId" | "raceId" | "rulesetId" | "userId" | "xp"
  >;
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

/**
 * A level's row's columns, as its module's storage declaration writes an advancement (3.5's class level and hit
 * points).
 */
export type LevelColumns = Record<string, unknown>;

/** A level's rows under it, by the name of the pick its module declares each under: what a save writes under it. */
export type LevelRows = Record<string, object[]>;
