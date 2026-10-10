/**
 * What the characters part's `plan*` operations answer: what the server writes of a character, each a named plan: a new
 * character's race and ability scores, an ability edit's, its languages, an inventory entry's fields. Each names the
 * entities it writes by the ids the ruleset's view keys them by, whichever the request sent (`RequestIds`).
 */

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
  weaponSet: number | null;
}

/** What a character's languages edit writes: the languages it speaks. */
export interface LanguagesPlan {
  languageIds: string[];
}

/** What a new character stores: its race, and a score for each of the ruleset's abilities. */
export interface NewCharacterPlan {
  abilities: AbilityScore[];
  raceId: string;
}
