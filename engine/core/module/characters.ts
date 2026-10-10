import type { ItemLocation } from "@/shared/enums.ts";
import type { Item, Modifier, Property, Requirement } from "@/shared/relations.ts";

/** A character's score in one of its ruleset's abilities, as it stores it. */
export interface AbilityScore {
  abilityId: string;
  score: number;
}

/** A character's card, as a list of characters shows it: its race, its classes at their highest level, its total. */
export interface CharacterCard {
  levels: { klass: string; level: number }[];
  race: string;
  totalLevel: number;
}

/** A character's inventory entry, as its sheet lists it: the entry, with its item as the view composes it. */
export type DescribedInventoryEntry<T> = T & {
  item: Item & { modifiers: Modifier[]; properties: Property[]; requirements: Requirement[] };
};

/** What an inventory entry's add (a new entry of `item`) or edit (an `entry` of the character's) asks. */
export type InventoryEntryChange =
  | { item: Item; request: InventoryEntryRequest }
  | { entry: { id: string; itemId: string }; request: InventoryEntryRequest };

/** What an inventory entry's add or edit stores: where its item is held, and its charges. */
export interface InventoryEntryFields {
  equipped: boolean;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
  weaponSet: number | null;
}

/** What an inventory entry's add or edit asks: where its item is held, its charges, and whether to force the rules. */
export interface InventoryEntryRequest {
  equipped: boolean;
  force: boolean;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
  weaponSet: number | null;
}

/** How a campaign member reads a character: partly (`partial`), or its sheet with its private notes shown or blank. */
export type MemberReading = "blank" | "partial" | "show";

/** What a new character stores beside its row: a score for each of the ruleset's abilities. */
export interface NewCharacterPlan {
  abilities: AbilityScore[];
}

/** What a viewer reads of a character's private notes: all of it, a blank, or no field at all. */
export type PrivateNotes = "blank" | "omit" | "show";
