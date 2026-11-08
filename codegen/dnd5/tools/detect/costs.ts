/** An item's cost, as the database writes it (an amount of a coin), in gold pieces. */

import type { Cost } from "@/codegen/dnd5/tools/types/common.ts";

/** What each coin is worth in gold pieces, by its abbreviation. */
const COIN_VALUES: Readonly<Record<string, number>> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/** A cost in gold pieces, to the hundredth (a copper piece's): an unknown coin throws. */
export function readCost({ quantity, unit }: Cost): number {
  const value = COIN_VALUES[unit.toLowerCase()];
  if (value === undefined) throw new Error(`"${unit}" is no coin`);
  return Math.round(quantity * value * 100) / 100;
}
