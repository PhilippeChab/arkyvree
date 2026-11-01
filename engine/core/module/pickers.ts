import type { EntityFilters, EntityGroupMember } from "./parts/entities/index.ts";
import type { StepOption, StepOptionGroup } from "./parts/levelUp/index.ts";
import type { EntityRecord } from "./storage.ts";

/**
 * A picker, as an operation opens it: what the server reads a page of options with (`filters`), and a page described
 * (`describe`), each option with whether who it picks for may pick it and what the picker adds.
 */
export interface OpenedPicker<Filters, Row extends { id: string }, Details> {
  describe<R extends Row>(rows: R[]): PickerOption<R, Details>[];
  readonly filters: Filters;
}

/**
 * A page's group of a list's entities, as the server reads it (3.5's feat family): its entity (its one member's, or the
 * one standing for them), its name, its group (`null` for an entity in none), and how many it holds.
 */
export interface OptionGroupRow {
  count: number;
  description: string | null;
  group: string | null;
  id: string;
  name: string;
}

/** A page's entity of a list, as the server reads it: its id, its name and its text. */
export interface OptionRow {
  description: string | null;
  id: string;
  name: string;
}

/**
 * What a page of a list's entities is read with: those of the list (`ids`), less those left out (`excludeIds`), of the
 * values of their fields (`fields`: a feat's selectable).
 */
export interface PickFilters {
  excludeIds: string[];
  fields?: EntityFilters["fields"];
  ids: string[];
}

/**
 * What a page of a list's groups is read with: the list's entities, less those left out, of the values of their
 * fields, and the group each one is in (`groups`, as the ruleset groups them): an entity in none stands alone.
 */
export interface PickGroupFilters extends PickFilters {
  groups: EntityGroupMember[];
}

/**
 * A level step's picker of groups (3.5's feats, by family): what the server reads a page of groups with
 * (`groupFilters`), and the page it read as the step's groups, each with whether the character may take it.
 */
export interface StepGroupsPicker {
  describeGroups(rows: OptionGroupRow[]): StepOptionGroup[];
  readonly groupFilters: PickGroupFilters;
}

/**
 * A level step's picker of options (3.5's classes, feats and spells): what the server reads a page of rows with
 * (`filters`), and the page it read as the step's options, each with whether the character may take it and what it
 * lacks when not.
 */
export interface StepOptionsPicker<Filters, Row extends OptionRow> {
  describeOptions(rows: Row[]): StepOption[];
  readonly filters: Filters;
}

/**
 * What a page of a kind's tracks is read with (a level step's: 3.5's classes): the kind's filters, and the tracks it
 * lists first (`firstIds`, in their order: the character's, as its picker orders them), the others after them by name.
 */
export interface TrackFilters extends EntityFilters {
  firstIds: readonly string[];
}

/**
 * A level step's picker, as its module opens it, in no game's nouns: the kind it reads a page of (`kind`), the read it
 * takes (`read`), and its picker, which says what it reads it with and describes the page it read as the step's:
 * - `tracks`: the tracks of its kind the character may advance on (3.5's classes), read as its kind's rows in the
 *   character's ruleset, those its picker lists first ahead (`TrackFilters`), each with its place on its track (`StepOption`'s `track`);
 * - `options`: a list's entities (`OptionRow`);
 * - `groups`: a list's groups (3.5's feat families), a group's entities as one row (`OptionGroupRow`).
 */
export type OpenedStepPicker = { kind: string } & (
  | { picker: StepOptionsPicker<TrackFilters, EntityRecord & OptionRow>; read: "tracks" }
  | { picker: StepOptionsPicker<PickFilters, OptionRow>; read: "options" }
  | { picker: StepGroupsPicker; read: "groups" }
);

/**
 * An option a picker describes: its row, whether who the picker is for may pick it (`eligible`), the tree of the
 * requirements it fails, and what the picker adds of it (`Details`).
 */
export type PickerOption<R, Details> = R & Details & { eligible: boolean; requirementTree?: string };
