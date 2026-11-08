/**
 * The SRD 5.2.1's Armor table: each armor's definition, which its item's fields are read from (an item's builders, the
 * codegen's items), and the Shield's. Beside them, what an item's fields offer: the armor categories, and the armor's
 * names, read off the table.
 */

/**
 * An armor's row: its category, its base Armor Class, how much of its Dexterity modifier its wearer adds, the Strength
 * it needs, whether it hinders Stealth, its cost and its weight.
 */
interface ArmorDefinition {
  armorClass: number;
  category: (typeof ARMOR_CATEGORIES)[number];
  /** What it costs, in gold pieces. */
  cost: number;
  /** The most Dexterity modifier its wearer adds: none for heavy armor (0), 2 for medium, all of it for light (null). */
  maxDex: number | null;
  stealthDisadvantage: boolean;
  /** The Strength score its wearer needs, or its speed is 10 feet lower: 0 for none. */
  strength: number;
  /** What it weighs, in pounds. */
  weight: number;
}

/** The armor categories, from the lightest to the heaviest: the armor training a class gives is by category. */
export const ARMOR_CATEGORIES = ["Light", "Medium", "Heavy"] as const;

/** Each armor's row, by its name, as the table gives it. */
// oxfmt-ignore
export const ARMOR_DEFINITIONS: Partial<Record<string, ArmorDefinition>> = {
  "Padded Armor": { category: "Light", armorClass: 11, maxDex: null, strength: 0, stealthDisadvantage: true, cost: 5, weight: 8 },
  "Leather Armor": { category: "Light", armorClass: 11, maxDex: null, strength: 0, stealthDisadvantage: false, cost: 10, weight: 10 },
  "Studded Leather Armor": { category: "Light", armorClass: 12, maxDex: null, strength: 0, stealthDisadvantage: false, cost: 45, weight: 13 },
  "Hide Armor": { category: "Medium", armorClass: 12, maxDex: 2, strength: 0, stealthDisadvantage: false, cost: 10, weight: 12 },
  "Chain Shirt": { category: "Medium", armorClass: 13, maxDex: 2, strength: 0, stealthDisadvantage: false, cost: 50, weight: 20 },
  "Scale Mail": { category: "Medium", armorClass: 14, maxDex: 2, strength: 0, stealthDisadvantage: true, cost: 50, weight: 45 },
  Breastplate: { category: "Medium", armorClass: 14, maxDex: 2, strength: 0, stealthDisadvantage: false, cost: 400, weight: 20 },
  "Half Plate Armor": { category: "Medium", armorClass: 15, maxDex: 2, strength: 0, stealthDisadvantage: true, cost: 750, weight: 40 },
  "Ring Mail": { category: "Heavy", armorClass: 14, maxDex: 0, strength: 0, stealthDisadvantage: true, cost: 30, weight: 40 },
  "Chain Mail": { category: "Heavy", armorClass: 16, maxDex: 0, strength: 13, stealthDisadvantage: true, cost: 75, weight: 55 },
  "Splint Armor": { category: "Heavy", armorClass: 17, maxDex: 0, strength: 15, stealthDisadvantage: true, cost: 200, weight: 60 },
  "Plate Armor": { category: "Heavy", armorClass: 18, maxDex: 0, strength: 15, stealthDisadvantage: true, cost: 1500, weight: 65 },
};

/** The armors, the table's, by name. */
export const ARMOR_NAMES = Object.keys(ARMOR_DEFINITIONS).toSorted();

/** The Shield's row: what it adds to its wielder's Armor Class, with the training to use it (+2), its cost and weight. */
export const SHIELD_DEFINITION = { armorClass: 2, cost: 10, weight: 6 } as const;

/** The speed heavy armor costs a wearer without the Strength it needs: 10 feet. */
export const UNMET_STRENGTH_SPEED_PENALTY = 10;
