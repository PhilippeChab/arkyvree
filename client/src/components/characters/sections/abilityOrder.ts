import type { BaseRules } from "@/shared/enums.ts";

/** The order a sheet lists its abilities in, by its base rules. */
const ABILITY_ORDERS: Record<BaseRules, readonly string[]> = {
  "Dungeons & Dragons: 3.5": ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
};

/** `items` in their base rules' order of abilities, by each one's name; one it doesn't name goes last. */
export function sortAbilities<T>(items: T[], baseRules: BaseRules, getName: (item: T) => string): T[] {
  const order = ABILITY_ORDERS[baseRules];
  return [...items].sort((a, b) => {
    const ai = order.indexOf(getName(a).toLowerCase());
    const bi = order.indexOf(getName(b).toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
