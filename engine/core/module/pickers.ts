import type { EntityFilters } from "./parts/entities/index.ts";

/** A grouped picker, as an operation opens it: a picker that also lists its options by group (a feat's family). */
export interface OpenedGroupedPicker<
  Filters,
  GroupFilters,
  Row extends { id: string },
  Details,
  Group,
> extends OpenedPicker<Filters, Row, Details> {
  /** A page of groups described: a group of one option as that option, a larger one as its group. */
  describeGroups<T extends { representativeId: string; variantCount: number }>(rows: T[]): (T & Group)[];
  /** What the server reads a page of groups with. */
  readonly groupFilters: GroupFilters;
}

/**
 * A picker, as an operation opens it: what the server reads a page of options with (`filters`), and a page described
 * (`describe`), each option with whether who it picks for may pick it and what the picker adds.
 */
export interface OpenedPicker<Filters, Row extends { id: string }, Details> {
  describe<R extends Row>(rows: R[]): PickerOption<R, Details>[];
  readonly filters: Filters;
}

/**
 * A track picker, as a `plan` step opens it (3.5's classes): the tracks of its kind the character may advance on, read
 * as its kind's rows in the character's ruleset, those it advanced on first (`filters`), each described with its place
 * on the track (`StepOption`'s `track`).
 */
export interface OpenedTrackPicker<Filters, Row extends { id: string }> extends OpenedPicker<
  Filters,
  Row,
  { track: { last: number; left: number; next: number } }
> {
  /** That its options are tracks, read as rows of its kind in the advancements' order. */
  readonly tracks: true;
}

/**
 * What a page of a list's entities is read with: those of the list (`ids`), less those left out (`excludeIds`), of the
 * values of their fields (`fields`: a feat's selectable; the options of a group, by the field that names it).
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
export interface PickGroupFilters {
  excludeIds: string[];
  fields?: EntityFilters["fields"];
  groups: { group: string; id: string }[];
  ids: string[];
}

/**
 * An option a picker describes: its row, whether who the picker is for may pick it (`eligible`), the tree of the
 * requirements it fails, and what the picker adds of it (`Details`).
 */
export type PickerOption<R, Details> = R & Details & { eligible: boolean; requirementTree?: string };
