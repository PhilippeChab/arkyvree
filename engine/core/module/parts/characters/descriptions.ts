/**
 * What the characters part's `describe*` operations answer in a shape every ruleset shares: a character's card, how a
 * new one's ability scores are set, an inventory entry with its item, a placement's warning, a character's languages
 * and those one more pick may add, and where a sheet holds its private notes. What a ruleset describes in its own shape is
 * its `Descriptions` (`contract.ts`).
 */

import type { Item, Language, Modifier, Property, Requirement } from "@/shared/relations.ts";

import type { InventoryEntryPlan } from "./plans.ts";

/** A character's card, as a list of characters shows it: its race, its classes at their highest level, its total. */
export interface CharacterCard {
  levels: { klass: string; level: number }[];
  race: string;
  totalLevel: number;
}

/**
 * How a new character's ability scores are set: the ruleset's abilities, in the order its sheet lists them
 * (`abilities`), the ways its form offers (`methods`), the scores' bounds and the one an ability shows before it's
 * rolled or set (`scores`), and each score's modifier over those bounds (`modifiers`).
 */
export interface CharacterCreation {
  abilities: { id: string; name: string }[];
  methods: CreationMethod[];
  modifiers: Record<number, number>;
  scores: { max: number; min: number; start: number };
}

/**
 * A character's sheet as the API answers it, in every ruleset's shape: noted (`NotedSheet`), with its bonded creatures'
 * sheets (`bonded`, none for a creature's own), each noted.
 */
export interface DescribedSheet extends NotedSheet {
  bonded: Record<string, NotedSheet>;
}

/**
 * What a character speaks, and what its picked languages (an edit's, as it's made) leave it room for: what its languages
 * picker offers. `automatic`: those it speaks without picking them (a 3.5 race's automatic languages, which its
 * modifiers grant), never stored; `picks`: the picks, past those; `options`: the languages one more pick may add, by
 * name, none once the picks fill the room its rules give them.
 */
export interface LanguagesDescription {
  automatic: DescribedLanguage[];
  options: DescribedLanguage[];
  picks: DescribedLanguage[];
}

/**
 * Where a sheet, as the API answers it, holds its character's private notes, in every ruleset's: its identity's
 * background, where the characters part shows them, blanks them or leaves them out as its reader reads them.
 */
export interface NotedSheet {
  identity: { background: { privateNotes?: string } };
}

/** Why a placement can't take one more item, if it can't: what the inventory dialogs warn of, and an add refuses. */
export interface PlacementDescription {
  warning: string | null;
}

/**
 * A way a new character's ability scores are set, which its form runs by its kind: rolled (`dice`: `count` dice of
 * `sides`, the highest `keep` summed), taken from an array (`scores`, each to one ability), or bought (`costs`, each
 * score's from `min` to `max`, out of `budget`).
 */
export type CreationMethod = { id: string; label: string } & (
  | { dice: { count: number; keep: number; sides: number }; kind: "roll" }
  | { kind: "array"; scores: readonly number[] }
  | { budget: number; costs: Readonly<Record<number, number>>; kind: "pointBuy"; max: number; min: number }
);

/**
 * A character's inventory entry, as its sheet lists it: the entry, what its ruleset shows of it (`X`: where its item
 * can go, where it's worn), and its item as the view composes it.
 */
export type DescribedInventoryEntry<T, X = unknown> = T &
  X & {
    item: Item & { modifiers: Modifier[]; properties: Property[]; requirements: Requirement[] };
  };

/** A language, as a character's languages name it. */
export type DescribedLanguage = Pick<Language, "id" | "name" | "type">;

/** An inventory entry, as where it's held reads it: whether it's equipped, where, and its weapon sets in a hand. */
export type HeldInventoryEntry = Pick<InventoryEntryPlan, "equipped" | "location" | "weaponSets">;
