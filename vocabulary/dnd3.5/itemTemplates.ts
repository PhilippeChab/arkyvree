/**
 * The item types an item has, those it can be based on a template of, which the item's form offers and the API's
 * templates list, and the most variants of an item its form makes at once.
 */

/** A weapon, an armor or a shield can be based on a template: a weapon's, an armor's or a shield's. */
export const TEMPLATE_ITEM_TYPES = ["Weapon", "Armor", "Shield"] as const;

/** The types an item has, which its form offers: those a template is of, then the others. */
export const ITEM_TYPES = [...TEMPLATE_ITEM_TYPES, "Wondrous Item", "Ring", "Rod", "Staff", "Other"] as const;

/** The most variants of an item a form makes at once. */
export const MAX_ITEM_VARIANTS = 50;
