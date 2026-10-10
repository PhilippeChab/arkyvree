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
 * An option a picker describes: its row, whether who the picker is for may pick it (`eligible`), the tree of the
 * requirements it fails, and what the picker adds of it (`Details`).
 */
export type PickerOption<R, Details> = R & Details & { eligible: boolean; requirementTree?: string };

/** What a page of a list's entities is read with: those of the list (`ids`), less those left out (`excludeIds`). */
export interface PickFilters {
  excludeIds: string[];
  /** The options of a group, by the property that names it. */
  family?: { type: string; value: string };
  ids: string[];
}

/**
 * What a page of a list's groups is read with: the list's entities, less those left out, and the group each one is in
 * (`families`, as the ruleset groups them): an entity in none stands alone.
 */
export interface PickGroupFilters {
  excludeIds: string[];
  families: { family: string; id: string }[];
  ids: string[];
}
