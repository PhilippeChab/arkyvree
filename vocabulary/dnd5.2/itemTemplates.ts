/**
 * The item types an item has, those it can be based on a template of, which the item's form offers and the API's
 * templates list, and the most variants of an item its form makes at once.
 */

/** A magic item's rarity, as the SRD 5.2.1 names them, commonest first: "Varies" for an item whose variants differ. */
export const ITEM_RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"] as const;

/** A weapon, an armor or a Shield can be based on a template: a weapon's, an armor's or a Shield's (a +1 Longsword). */
export const TEMPLATE_ITEM_TYPES = ["Weapon", "Armor", "Shield"] as const;

/**
 * The types an item has, which its form offers: those a template is of, then the SRD 5.2.1's other magic item
 * categories (a potion, a ring, a rod, a scroll, a staff, a wand, a wondrous item), then a tool, then every other item
 * (adventuring gear, ammunition, a pack, a mount).
 */
export const ITEM_TYPES = [
  ...TEMPLATE_ITEM_TYPES,
  "Potion",
  "Ring",
  "Rod",
  "Scroll",
  "Staff",
  "Wand",
  "Wondrous Item",
  "Tool",
  "Other",
] as const;

/** The most variants of an item a form makes at once. */
export const MAX_ITEM_VARIANTS = 50;
