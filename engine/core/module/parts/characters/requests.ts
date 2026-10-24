/**
 * What the characters part's operations take, past the rows the server read and the view: a new character's form, a
 * scored link's edit, an inventory entry's add or edit and a placement's query, a creation pick's picker query, how a
 * reader reads a sheet and what a printed one adds. Whether to force the rules is always an operation's last argument.
 */

import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";

import type { InventoryEntryPlan } from "./plans.ts";

/**
 * A character's edit, as its sheet sends it: its fields by their keys, and each picked link's picks by its name, each
 * when it sends them.
 */
export interface CharacterEditRequest {
  fields?: FieldsRequest;
  links?: Record<string, string[]>;
}

/** A new character, as its form sends it: what it starts with, and its ruleset's fields by their keys (`CharacterForm`'s). */
export interface NewCharacterRequest extends StartRequest {
  fields: FieldsRequest;
}

/**
 * Where an inventory dialog places an item: `location`, in each of `weaponSets` for a hand, the entry placed (`entryId`)
 * aside.
 */
export interface PlacementQuery {
  entryId: string | null;
  location: ItemLocation;
  weaponSets: number[];
}

/** A printed sheet's request: whether it adds the diagnostics page, and the character's portrait. */
export interface SheetRequest {
  diagnostics: boolean;
  portraitUrl?: string | null;
}

/**
 * What a new character starts with, as its form or its import gives it: the entity each of its creation's picks names
 * (`picks`, by the column of its single link), and each scored link's amounts (`scores`, by the link's name).
 */
export interface StartRequest {
  picks: Record<string, string>;
  scores: Record<string, ScoresRequest>;
}

/**
 * A creation pick's picker query: what a new character's form says so far, in the fields that narrow its options, by
 * their keys.
 */
export type CreationPickQuery = Record<string, string | undefined>;

/**
 * A character's fields, by their keys: a `fields` block's edit (null: cleared, or left as it is where it can't be), or
 * a new character's form's (null: none).
 */
export type FieldsRequest = Record<string, number | string | null>;

/**
 * What an inventory entry's add (a new entry of the ruleset's item `itemId`) or edit (an `entry` of the character's)
 * asks.
 */
export type InventoryEntryChange =
  | { itemId: string; request: InventoryEntryRequest }
  | { entry: { id: string; itemId: string }; request: InventoryEntryRequest };

/** What an inventory entry's add or edit asks: the fields it stores but its item, which the plan answers checked. */
export type InventoryEntryRequest = Omit<InventoryEntryPlan, "itemId">;

/** How a campaign member reads a character: partly (`partial`), or its sheet with its private notes or without. */
export type MemberReading = "partial" | PrivateNotes;

/**
 * Where an inventory entry's add or edit places its item, as a ruleset checks it: a new entry's item as the view has it
 * (`item`), or an `entry` of the character's.
 */
export type PlacementChange =
  | { item: ViewEntities["items"]; request: InventoryEntryRequest }
  | { entry: { id: string; itemId: string }; request: InventoryEntryRequest };

/** Whether a viewer reads a character's private notes: shown, or left out of its sheet (`hide`). */
export type PrivateNotes = "hide" | "show";

/** A scored link's amounts, by the id of each entity it scores. */
export type ScoresRequest = Record<string, number>;
