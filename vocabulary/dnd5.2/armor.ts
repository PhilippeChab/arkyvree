/**
 * The SRD 5.2.1's Armor table: each armor's definition, which its fields are read from (an item's builders, the
 * codegen's items), and the Shield's. Its other columns are an item's (its cost and weight). Beside them, what an
 * item's fields offer: the armor categories, and the armor's names, read off the table.
 */

/** An armor's row: its category, its base Armor Class, how much of its Dexterity modifier its wearer adds, the Strength
 * it needs, and whether it hinders Stealth. */
interface ArmorDefinition {
  armorClass: number;
  category: (typeof ARMOR_CATEGORIES)[number];
  /** The most Dexterity modifier its wearer adds: none for heavy armor (0), 2 for medium, all of it for light (null). */
  maxDex: number | null;
  stealthDisadvantage: boolean;
  /** The Strength score its wearer needs, or its speed is 10 feet lower: 0 for none. */
  strength: number;
}

/** The armor categories, from the lightest to the heaviest: the armor training a class gives is by category. */
export const ARMOR_CATEGORIES = ["Light", "Medium", "Heavy"] as const;

/** Each armor's row, by its name, as the table gives it. */
// oxfmt-ignore
export const ARMOR_DEFINITIONS: Partial<Record<string, ArmorDefinition>> = {
  "Padded Armor": { category: "Light", armorClass: 11, maxDex: null, strength: 0, stealthDisadvantage: true },
  "Leather Armor": { category: "Light", armorClass: 11, maxDex: null, strength: 0, stealthDisadvantage: false },
  "Studded Leather Armor": { category: "Light", armorClass: 12, maxDex: null, strength: 0, stealthDisadvantage: false },
  "Hide Armor": { category: "Medium", armorClass: 12, maxDex: 2, strength: 0, stealthDisadvantage: false },
  "Chain Shirt": { category: "Medium", armorClass: 13, maxDex: 2, strength: 0, stealthDisadvantage: false },
  "Scale Mail": { category: "Medium", armorClass: 14, maxDex: 2, strength: 0, stealthDisadvantage: true },
  Breastplate: { category: "Medium", armorClass: 14, maxDex: 2, strength: 0, stealthDisadvantage: false },
  "Half Plate Armor": { category: "Medium", armorClass: 15, maxDex: 2, strength: 0, stealthDisadvantage: true },
  "Ring Mail": { category: "Heavy", armorClass: 14, maxDex: 0, strength: 0, stealthDisadvantage: true },
  "Chain Mail": { category: "Heavy", armorClass: 16, maxDex: 0, strength: 13, stealthDisadvantage: true },
  "Splint Armor": { category: "Heavy", armorClass: 17, maxDex: 0, strength: 15, stealthDisadvantage: true },
  "Plate Armor": { category: "Heavy", armorClass: 18, maxDex: 0, strength: 15, stealthDisadvantage: true },
};

/** The armors, the table's, by name. */
export const ARMOR_NAMES = Object.keys(ARMOR_DEFINITIONS).toSorted();

/** What a Shield adds to its wielder's Armor Class, with the training to use it: 2. */
export const SHIELD_ARMOR_CLASS = 2;

/** The speed heavy armor costs a wearer without the Strength it needs: 10 feet. */
export const UNMET_STRENGTH_SPEED_PENALTY = 10;
