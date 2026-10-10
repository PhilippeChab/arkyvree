/**
 * What the characters part's operations take, past the rows the server read and the view: a new character's form, an
 * ability edit, an inventory entry's add or edit and a placement's query, the race picker's query, how a reader reads a
 * sheet and what a printed one adds. Whether to force the rules is always an operation's last argument.
 */

import type { ItemLocation } from "@/shared/enums.ts";
import type { Item } from "@/shared/relations.ts";

import type { InventoryEntryPlan } from "./plans.ts";

/** A form's ability scores, by ability id. */
export type AbilitiesRequest = Record<string, number>;

/** What an inventory entry's add (a new entry of `item`) or edit (an `entry` of the character's) asks. */
export type InventoryEntryChange =
  | { item: Item; request: InventoryEntryRequest }
  | { entry: { id: string; itemId: string }; request: InventoryEntryRequest };

/** What an inventory entry's add or edit asks: the fields it stores, which the plan answers checked. */
export type InventoryEntryRequest = InventoryEntryPlan;

/** How a campaign member reads a character: partly (`partial`), or its sheet with its private notes shown or blank. */
export type MemberReading = "blank" | "partial" | "show";

/** A new character, as its form sends it: its race, and its ability scores. */
export interface NewCharacterRequest {
  abilities: AbilitiesRequest;
  raceId: string;
}

/** Where an inventory dialog places an item: `location`, in `weaponSet` for a hand, the entry placed (`entryId`) aside. */
export interface PlacementQuery {
  entryId: string | null;
  location: ItemLocation;
  weaponSet: number | null;
}

/** What a viewer reads of a character's private notes: all of it, a blank, or no field at all. */
export type PrivateNotes = "blank" | "omit" | "show";

/** The race picker's query: what a new character's form says so far. */
export interface RacePickQuery {
  alignment?: string;
  gender?: string;
}

/** A printed sheet's request: whether it adds the diagnostics page, and the character's portrait. */
export interface SheetRequest {
  diagnostics: boolean;
  portraitUrl?: string | null;
}
