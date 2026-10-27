/**
 * What the characters part's `describe*` operations answer in a shape every ruleset shares: a character's card, a new
 * character's form and how its scores are set, a picked link's room, a scored link's bounds, an inventory entry with
 * its item, a placement's warning, where a sheet holds its private notes, a sheet's row's columns and a partial
 * reading's allowlist. What a ruleset describes in its own shape is its `Descriptions` (`contract.ts`).
 */

import type { ValidationResult } from "@/engine/core/character/index.ts";
import type { InventoryItem } from "@/engine/core/view/index.ts";
import type { Character, Modifier, Requirement, Ruleset } from "@/shared/relations.ts";

import type { FieldsBlock, SheetBlock } from "./blocks.ts";
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
 * What a sheet, as the API answers it, opens with in every ruleset's: its character's row's own columns and its
 * ruleset's (its name, its base rules, and whether it's a user's own rather than a system one). Its share token is
 * none (`shareToken`): whether a reader reads it is the server's access decision, which writes it for who may.
 */
export interface CharacterColumns {
  baseRules: Ruleset["baseRules"];
  deletedAt: Character["deletedAt"];
  id: string;
  isCustomRuleset: boolean;
  kind: Character["kind"];
  name: string;
  parentCharacterId: Character["parentCharacterId"];
  rulesetId: string;
  rulesetName: string;
  shareToken: null;
  updatedAt: Character["updatedAt"];
  userId: Character["userId"];
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

/**
 * What a ruleset describes of a character a campaign member reads partly (`PartialSheet`): its identity's `fields`
 * block as such a reader reads it (who it is and what it looks like: 3.5's race and physical traits), and its summary,
 * whose tracks the characters part leaves out.
 */
export interface PartialReading {
  identity: FieldsBlock;
  summary: SheetSummary;
}

/**
 * A character as a campaign member who reads it partly reads it, whatever its ruleset: an allowlist, which the
 * characters part writes. Its row's columns, no requirements nor modifiers, a valid validation, a summary with no
 * tracks, and its identity's block alone (`PartialReading`).
 */
export interface PartialSheet extends CharacterColumns {
  blocks: FieldsBlock[];
  modifiers: Record<string, never>;
  requirements: Record<string, never>;
  summary: SheetSummary;
  validation: ValidationResult;
}

/** Why a placement can't take one more item, if it can't: what the inventory dialogs warn of, and an add refuses. */
export interface PlacementDescription {
  warning: string | null;
}

/**
 * A ruleset's sheet as the API answers it, past its row's columns (`CharacterColumns`, which the characters part
 * writes): its blocks and summary (`NotedSheet`), what its modifiers and requirements did, in its ruleset's shape, and
 * its validation.
 */
export interface RulesetSheet extends NotedSheet {
  modifiers: object;
  requirements: object;
  validation: ValidationResult;
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
 * can go, where it's worn), and its item as the view composes it, its fields as an item's answer carries them (its
 * template's of those it holds none of among them).
 */
export type DescribedInventoryEntry<T, X = unknown> = T &
  X & {
    item: Omit<InventoryItem, "fields"> & {
      fields: Record<string, unknown>;
      modifiers: Modifier[];
      requirements: Requirement[];
    };
  };

/**
 * A character's sheet as the API answers it, whatever its ruleset (`S`, its ruleset's sheet): its row's columns, then
 * its ruleset's sheet's declared keys alone (`RulesetSheet`).
 */
export type DescribedSheet<S extends RulesetSheet> = CharacterColumns & Pick<S, keyof RulesetSheet>;

/**
 * An inventory entry, as where it's held reads it: whether it's equipped, where, and its groups (3.5's weapon sets).
 */
export type HeldInventoryEntry = Pick<InventoryEntryPlan, "equipped" | "groups" | "location">;
