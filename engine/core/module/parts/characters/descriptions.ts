/**
 * What the characters part's `describe*` operations answer in a shape every ruleset shares: a character's card, a new
 * character's form and how its scores are set, a picked link's room, a scored link's bounds, an inventory entry with
 * its item, a placement's warning, and where a sheet holds its private notes. What a ruleset describes in its own shape
 * is its `Descriptions` (`contract.ts`).
 */

import type { InventoryItem } from "@/engine/core/view/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

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
 * A new character's form, as its rules lay it out: its sections in order, each under its title, a scored link's scores
 * (`scores`: its `role`'s, set the ways its ruleset's creation offers, what it says without entities to score, `none`,
 * and before a ruleset is picked, `pick`) or its lines (`fields`). A line of one item stands alone, of several side by
 * side from a tablet's width. An item is the form's own (`name`, under its label; its `ruleset`; a creation pick,
 * `pick`: the single link of its `role`, 3.5's race, under its label, which the fields marked `narrows` narrow,
 * what's said without one, `required`, and of one they rule out, `ineligible`; its `notes`) or one of its ruleset's
 * fields (`CreationField`).
 */
export interface CharacterForm {
  sections: CreationSection[];
}

/** An entity a character's link names, as its pickers and its sheet name it. */
export interface DescribedLink {
  id: string;
  name: string;
}

/**
 * What a character has of a picked link, and what its picks (an edit's, as it's made) leave it room for: what the
 * link's picker offers. `automatic`: those it has without picking them (3.5's race's automatic languages, which its
 * modifiers grant), never stored; `picks`: the picks, past those; `options`: the entities one more pick may add, by
 * name, none once the picks fill the room its rules give them.
 */
export interface LinkRoom {
  automatic: DescribedLink[];
  options: DescribedLink[];
  picks: DescribedLink[];
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
 * A scored link's bounds (3.5's ability scores): the lowest and highest amount, and the one an entity starts at when a
 * new character's form doesn't set it.
 */
export interface ScoreBounds {
  max: number;
  min: number;
  start: number;
}

/**
 * How a new character's scores of a scored link are set: the entities it scores, in the order its sheet lists them
 * (`entities`: 3.5's abilities), the ways its form offers (`methods`), the scores' bounds and the one an entity shows
 * before it's rolled or set (`scores`), and each score's modifier over those bounds (`modifiers`).
 */
export interface ScoresCreation {
  entities: DescribedLink[];
  methods: CreationMethod[];
  modifiers: Record<number, number>;
  scores: ScoreBounds;
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
 * line of text or several (`placeholder`: what it says empty). `narrows`: a select its creation picks' pickers narrow
 * their options by (3.5's alignment and gender, a race's). Its key is a plain name (letters, digits and `_`), none of
 * the form's own values' nor a picker's query's.
 */
export type CreationField = { key: string; label: string } & (
  | { kind: "number"; min: number; required?: string; start?: number; stepped?: boolean }
  | { kind: "select"; narrows?: boolean; options: string[]; required?: string }
  | { kind: "text"; placeholder?: string }
  | { kind: "textarea"; placeholder: string }
);

/**
 * An item of a new character's form's line: one of the form's own (its name, its notes, its ruleset, or a creation
 * pick: the entity of a single link its row holds, by its `role`, picked from its picker under its label, what's said
 * without one, `required`, and of one the fields that narrow it rule out, `ineligible`: 3.5's race), or one of its
 * ruleset's fields.
 */
export type CreationItem =
  | CreationField
  | { ineligible: string; kind: "pick"; label: string; required: string; role: string }
  | { kind: "name"; label: string }
  | { kind: "notes" }
  | { kind: "ruleset" };

/**
 * A way a new character's scores are set, which its form runs by its kind: rolled (`dice`: `count` dice of `sides`,
 * the highest `keep` summed), taken from an array (`scores`, each to one entity), or bought (`costs`, each score's
 * from `min` to `max`, out of `budget`).
 */
export type CreationMethod = { id: string; label: string } & (
  | { dice: { count: number; keep: number; sides: number }; kind: "roll" }
  | { kind: "array"; scores: readonly number[] }
  | { budget: number; costs: Readonly<Record<number, number>>; kind: "pointBuy"; max: number; min: number }
);

/**
 * A section of a new character's form, under its title: a scored link's amounts (`role`: 3.5's ability scores, set the
 * ways its creation offers; what it says without entities to score, `none`, and before a ruleset is picked, `pick`),
 * or its lines of items.
 */
export type CreationSection = { title: string } & (
  | { kind: "fields"; lines: CreationItem[][] }
  | { kind: "scores"; none: string; pick: string; role: string }
);

/**
 * A character's inventory entry, as its sheet lists it: the entry, what its ruleset shows of it (`X`: where its item
 * can go, where it's worn), and its item as the view composes it, with its fields (`F`, as its kind reads them, then its
 * own by name).
 */
export type DescribedInventoryEntry<T, X = unknown, F = unknown> = T &
  X & {
    item: Omit<InventoryItem, "fields"> & {
      fields: F & InventoryItem["fields"];
      modifiers: Modifier[];
      requirements: Requirement[];
    };
  };

/**
 * An inventory entry, as where it's held reads it: whether it's equipped, where, and its groups (3.5's weapon sets).
 */
export type HeldInventoryEntry = Pick<InventoryEntryPlan, "equipped" | "groups" | "location">;
