/**
 * What the characters part's `describe*` operations answer in a shape every ruleset shares: a character's card, how a
 * new one's ability scores are set, an inventory entry with its item, a placement's warning, a character's languages
 * and those one more pick may add, and where a sheet holds its private notes. What a ruleset describes in its own shape is
 * its `Descriptions` (`contract.ts`).
 */

import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

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
 * at its highest level).
 */
export interface CharacterCard {
  chips: CardChip[];
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
 * A new character's form, as its rules lay it out: its sections in order, each under its title, its ability scores
 * (`abilities`: set the ways its ruleset's creation offers, what it says without abilities to set, `none`, and before
 * a ruleset is picked, `pick`) or its lines (`fields`). A line of one item stands alone, of several side by side from a
 * tablet's width. An item is the form's own (`name`, under its label; the picks every character is made from, its
 * `ruleset` and its `race`, under its label, which the fields marked `racePick` narrow, what's said without one,
 * `required`, and of one they rule out, `ineligible`; its `notes`) or one of its ruleset's fields (`CreationField`).
 */
export interface CharacterForm {
  sections: CreationSection[];
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
 * What a sheet, as the API answers it, holds in every ruleset's: its blocks, in its module's order (`SheetBlock`), its
 * bonded creatures' among them (an entry's `subsheet`), and its summary. Its character's private notes are its
 * `fields` blocks', which the characters part leaves out for a reader who doesn't read them.
 */
export interface NotedSheet {
  blocks: SheetBlock[];
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
 * label and its edit's; what stands between two tracks on the line (`separator`), and the words of the page's own
 * actions (`words`: adding a level, removing the last, the removal's confirmation and its toasts, and a permanent
 * delete's confirmation, which says what goes with the character).
 */
export interface SheetSummary {
  separator: string;
  tracks: {
    advancements: { edit: string; id: string; label: string }[];
    entityType: string;
    id: string;
    label: string;
    name: string;
    words: { add: string; levels: string; open: string };
  }[];
  words: {
    add: string;
    deleteMessage: string;
    removed: string;
    removeFailed: string;
    removeLast: string;
    removeLastMessage: string;
  };
}

/**
 * A field of a new character's form, by its kind, keyed as its create sends it (`fields`): a whole number at least
 * `min` (`required`: what's said without one, else it may be left empty; `start`: its first value, else empty;
 * `stepped`: its input's own arrows stop at `min`), one of a select's options (`required`: what's said without one), a
 * line of text or several (`placeholder`: what it says empty). `racePick`: a select the race picker narrows its races
 * by. Its key is a plain name (letters, digits and `_`), none of the form's own values' nor the race picker's query's.
 */
export type CreationField = { key: string; label: string } & (
  | { kind: "number"; min: number; required?: string; start?: number; stepped?: boolean }
  | { kind: "select"; options: string[]; racePick?: boolean; required?: string }
  | { kind: "text"; placeholder?: string }
  | { kind: "textarea"; placeholder: string }
);

/** An item of a new character's form's line: one of the form's own, or one of its ruleset's fields. */
export type CreationItem =
  | CreationField
  | { kind: "name"; label: string }
  | { kind: "notes" }
  | { ineligible: string; kind: "race"; label: string; required: string }
  | { kind: "ruleset" };

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

/** A section of a new character's form, under its title: its ability scores, or its lines of items. */
export type CreationSection = { title: string } & (
  | { kind: "abilities"; none: string; pick: string }
  | { kind: "fields"; lines: CreationItem[][] }
);

/**
 * A character's inventory entry, as its sheet lists it: the entry, what its ruleset shows of it (`X`: where its item
 * can go, where it's worn), and its item as the view composes it.
 */
export type DescribedInventoryEntry<T, X = unknown> = T &
  X & {
    item: ViewEntities["items"] & { modifiers: Modifier[]; properties: Property[]; requirements: Requirement[] };
  };

/** A language, as a character's languages name it. */
export type DescribedLanguage = Pick<ViewEntities["languages"], "id" | "name" | "type">;

/** An inventory entry, as where it's held reads it: whether it's equipped, where, and its weapon sets in a hand. */
export type HeldInventoryEntry = Pick<InventoryEntryPlan, "equipped" | "location" | "weaponSets">;
