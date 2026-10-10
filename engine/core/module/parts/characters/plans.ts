/**
 * What the characters part's `plan*` operations answer: what the server writes of a character, each a named plan: a new
 * character's ability scores, an ability edit's, an inventory entry's fields.
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

/** What an inventory entry's add or edit stores: where its item is held, and its charges. */
export interface InventoryEntryPlan {
  equipped: boolean;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
  weaponSet: number | null;
}

/** What a new character stores beside its row: a score for each of the ruleset's abilities. */
export interface NewCharacterPlan {
  abilities: AbilityScore[];
}
