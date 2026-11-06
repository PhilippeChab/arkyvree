/**
 * How the items' categories read as the content's item types and slots: a mundane item's category, a magic item's,
 * the slot a wondrous item is worn in by the word that names it, and the magic items made of a template's every
 * weapon, armor or the Shield, a +1, +2 or +3 each.
 */

import type { ItemLocation } from "@/vocabulary/dnd5.2/equipment.ts";
import type { ITEM_TYPES } from "@/vocabulary/dnd5.2/itemTemplates.ts";

/** An item's type, as the vocabulary names it. */
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * The magic items made of every weapon, every armor or the Shield, by the name of the family the database gives them
 * under ("Weapon", its variants "Weapon +1"…), each variant a magic item made of each template of its type
 * ("Longsword +1"), with its bonus.
 */
export const ENHANCED_FAMILIES: Readonly<Record<string, "Armor" | "Shield" | "Weapon">> = {
  Armor: "Armor",
  Shield: "Shield",
  Weapon: "Weapon",
};

/** Each magic item category's item type, by the category the database names. */
export const MAGIC_ITEM_TYPES: Readonly<Record<string, ItemType>> = {
  Armor: "Armor",
  Potions: "Potion",
  Rings: "Ring",
  Rods: "Rod",
  Scrolls: "Scroll",
  Staffs: "Staff",
  Wands: "Wand",
  Weapons: "Weapon",
  "Wondrous Items": "Wondrous Item",
};

/** The equipment categories an item's a tool by (a Disguise Kit's "Other Tools", though it's adventuring gear too). */
export const TOOL_CATEGORIES = ["Tools", "Other Tools"];

/**
 * The slot a wondrous item is worn in, by a word of its name: its footwear, cloak, gloves, bracers or headwear, each a
 * location of one item. Any other is carried, or worn where no location holds one item.
 */
export const WORN_SLOTS: [RegExp, ItemLocation][] = [
  [/\b(?:Boots|Slippers)\b/, "Feet"],
  [/\b(?:Cape|Cloak|Mantle)\b/, "Shoulders"],
  [/\b(?:Gauntlets|Gloves)\b/, "Hands"],
  [/\bBracers\b/, "Wrists"],
  [/\b(?:Circlet|Crown|Goggles|Hat|Headband|Helm)\b/, "Head"],
];
