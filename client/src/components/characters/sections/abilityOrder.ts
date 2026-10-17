import type { BaseRules } from "@/shared/enums.ts";
import { sortByOrder } from "@/shared/sortByOrder.ts";

/** The order a sheet lists its abilities in, by its base rules. */
const ABILITY_ORDERS: Record<BaseRules, readonly string[]> = {
  "Dungeons & Dragons: 3.5": ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
};

/** `items` in their base rules' order of abilities, by each one's name; those it doesn't name go last, by name. */
export function sortAbilities<T>(items: T[], baseRules: BaseRules, getName: (item: T) => string): T[] {
  const byName = items.toSorted((a, b) => getName(a).localeCompare(getName(b)));
  return sortByOrder(byName, ABILITY_ORDERS[baseRules], (item) => getName(item).toLowerCase());
}
