const ABILITY_ORDERS: Record<string, string[]> = {
  "Dungeons & Dragons: 3.5": ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
};

export function sortAbilities<T>(items: T[], baseRules: string, getName: (item: T) => string): T[] {
  const order = ABILITY_ORDERS[baseRules];
  if (!order) return items;
  return [...items].sort((a, b) => {
    const ai = order.indexOf(getName(a).toLowerCase());
    const bi = order.indexOf(getName(b).toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
