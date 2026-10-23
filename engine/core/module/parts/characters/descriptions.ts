/**
 * What the characters part's `describe*` operations answer in a shape every ruleset shares: a character's card, how a
 * new one's ability scores are set, an inventory entry with its item, a placement's warning, a character's languages
 * and those one more pick may add, and where a sheet holds its private notes. What a ruleset describes in its own shape is
 * its `Descriptions` (`contract.ts`).
 */

import type { Item, Language, Modifier, Property, Requirement } from "@/shared/relations.ts";

import type { SheetBlock } from "./blocks.ts";
import type { InventoryEntryPlan } from "./plans.ts";

/**
 * A chip of a character's card: its label, its tone, and whether a campaign member who reads the character partly sees
 * it (`partial`: who it is, not what it took).
 */
export interface CardChip {
  label: string;
  partial: boolean;
  tone: "primary" | "secondary";
}

/**
 * A character's card, as a list of characters shows it: its chips, in its ruleset's order (3.5's race, then each class
 * at its highest level), and what its ruleset reads of it, until its lists read its chips alone (3.5's race, its
 * classes at their highest level, its total level).
 */
export interface CharacterCard {
  chips: CardChip[];
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
 * What a sheet, as the API answers it, holds in every ruleset's: its blocks, in its module's order (`SheetBlock`), and
 * its character's private notes in its identity's background, where the characters part shows them, blanks them or
 * leaves them out as its reader reads them (a `fields` block's, it leaves out for any reader who doesn't read them).
 */
export interface NotedSheet {
  blocks: SheetBlock[];
  identity: { background: { privateNotes?: string } };
  summary: SheetSummary;
}

/** Why a placement can't take one more item, if it can't: what the inventory dialogs warn of, and an add refuses. */
export interface PlacementDescription {
  warning: string | null;
}

/**
 * A value a sheet shows under its label, as its rules write it ("BAB", "+6/+1"): what the generic sheet's sections read
 * of a ruleset's sheet, a score's parts, its combat's line, an armor class's boxes, a load's figures.
 */
export interface SheetStat {
  label: string;
  value: string;
}

/**
 * A sheet's summary, its header's line: the tracks its character advances on (3.5's classes), in its order, each its
 * name, its label at its position ("Fighter 3"), its page (`entityType`, by its `id`), what its advancements' popover
 * says (`words`: its button's, the popover's, its add's), and its advancements, each its id (an edit opens it), its
 * label and its edit's.
 */
export interface SheetSummary {
  tracks: {
    advancements: { edit: string; id: string; label: string }[];
    entityType: string;
    id: string;
    label: string;
    name: string;
    words: { add: string; levels: string; open: string };
  }[];
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
