/**
 * What the level-up part's `plan*` operations answer: what the server writes of a level-up, a saved level's edit, a
 * level's removal and the character's children (the characters its levels give it: 3.5's bonded creatures), each a
 * named plan, without ids it doesn't have yet. A level's row and the rows under it are its module's, as its storage
 * declaration writes them: its advancement's columns, and its picks by the name the module declares each under.
 */

import type { CharacterRows } from "@/engine/core/module/CharacterInputs.ts";
import type { CharacterColumns, CreationColumns, LinkPlan } from "@/engine/core/module/parts/characters/index.ts";
import type { Character } from "@/shared/relations.ts";

/** The levels a child takes (their rows' columns), and the ids of those it loses. */
export interface ChildLevelsPlan {
  added: LevelColumns[];
  removedIds: string[];
}

/** What a character's children become: one plan per kind of child its levels give it. */
export interface ChildrenPlan {
  children: ChildPlan[];
}

/**
 * What a saved level's edit writes, checked: the level as saved (`level`), its row's new columns (its value: a level
 * keeps its track) and its rows under it in place of those it had, and what the children become.
 */
export interface LevelEditPlan extends ChildrenPlan, LevelWrites {
  level: CharacterRows["levels"][number];
}

/** What removing a character's last level writes: the level that goes, and what its children become. */
export interface LevelRemovalPlan extends ChildrenPlan {
  level: CharacterRows["levels"][number];
}

/** What a level-up writes, checked: each level's writes, and what the character's children become. */
export interface LevelsPlan extends ChildrenPlan {
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
 * A child a plan makes: its character's row, whole (its parent's, of its kind, the columns its module stores of it, and
 * what it takes of its parent), and its links, by the name its module declares each under (3.5's ability scores).
 */
export interface NewChild {
  links: Record<string, LinkPlan[]>;
  row: CharacterColumns &
    CreationColumns &
    Pick<Character, "kind" | "name" | "parentCharacterId" | "rulesetId" | "userId">;
}

/**
 * What a character's child of a kind (`kind`, the child's character kind) becomes once the character's levels change.
 * Without one for the kind, the child the character had goes (`removedId`). With one, the character keeps the child it
 * has (`keptId`), or one is made (`created`) in place of the one it had; the child kept or made takes or loses
 * `levels`.
 */
export type ChildPlan = { kind: string; removedId?: string } & (
  | { created: NewChild; levels: ChildLevelsPlan }
  | { keptId: string; levels: ChildLevelsPlan }
  | { levels: undefined }
);

/**
 * A level's row's columns, as its module's storage declaration writes an advancement (3.5's class level and hit
 * points).
 */
export type LevelColumns = Record<string, unknown>;

/** A level's rows under it, by the name of the pick its module declares each under: what a save writes under it. */
export type LevelRows = Record<string, object[]>;
