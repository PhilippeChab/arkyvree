/**
 * What the characters part's `plan*` operations answer: what the server writes of a character, each a named plan: a new
 * character's race and ability scores, an ability edit's, its languages, an inventory entry's fields. Each names the
 * entities it writes by the ids the ruleset's view keys them by, whichever the request sent (`RequestIds`).
 */

import type { InferInsertModel } from "drizzle-orm";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import type { ItemLocation } from "@/shared/enums.ts";

/** What a character's ability edit writes: its scores, each checked. */
export interface AbilitiesPlan {
  abilities: AbilityScore[];
}

/** A character's score in one of its ruleset's abilities, as it stores it. */
export interface AbilityScore {
  abilityId: string;
  score: number;
}

/** What a character's edit writes: its fields' columns, and its languages when it sends them. */
export interface CharacterEditPlan extends FieldsPlan {
  languages?: LanguagesPlan;
}

/**
 * What a character's fields edit writes: the columns its ruleset stores its fields in (`CharacterColumns`), each
 * checked.
 */
export interface FieldsPlan {
  columns: Partial<CharacterColumns>;
}

/**
 * What an inventory entry's add or edit stores: its item (an added one's, by the view's id; the one an edited entry
 * keeps), where it's held, and its charges.
 */
export interface InventoryEntryPlan {
  equipped: boolean;
  itemId: string;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
  /** The weapon sets a hand holds it in, stored from 0: none outside the hands */
  weaponSets: number[];
}

/** What a character's languages edit writes: the languages it picked, past those it speaks without picking them. */
export interface LanguagesPlan {
  languageIds: string[];
}

/**
 * What a new character stores: what it starts with (`StartPlan`), and the columns its fields write, those its row
 * requires among them.
 */
export interface NewCharacterPlan extends StartPlan {
  columns: CharacterColumns;
}

/** What a new character starts with: its race, and a score for each of the ruleset's abilities. */
export interface StartPlan {
  abilities: AbilityScore[];
  raceId: string;
}

/**
 * The columns of a character's row its ruleset writes, from its fields: those past the ones every character has (its
 * name, its notes) and those no field writes, the ones a new row requires among them.
 */
export type CharacterColumns = Omit<
  InferInsertModel<typeof charactersInCharacter>,
  | "createdAt"
  | "deletedAt"
  | "id"
  | "kind"
  | "lastChangedAt"
  | "name"
  | "notes"
  | "parentCharacterId"
  | "privateNotes"
  | "raceId"
  | "rulesetId"
  | "shareToken"
  | "updatedAt"
  | "userId"
>;
