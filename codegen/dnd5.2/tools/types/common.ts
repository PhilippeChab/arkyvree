/**
 * What every D&D 5th Edition reference's entries share, as the 5e-bits database writes them (its field names, its
 * `snake_case`): a named reference to another entry, a choice among options, a cost.
 */

/** A choice among options, as the database writes one: how many to choose, from what, as the book words it. */
export interface Choice {
  choose: number;
  desc?: string;
  from: { option_set_type: string; options?: unknown[] } & Record<string, unknown>;
  type: string;
}

/** A cost: an amount of a coin (`gp`, `sp`, `cp`). */
export interface Cost {
  quantity: number;
  unit: string;
}

/** Another entry, by its slug (`index`) and its name, as an entry names it ("Fighter", "Saving Throw: STR"). */
export interface Ref {
  index: string;
  name: string;
}
