/**
 * What a magic item's text says of it past its fields: its rarity as the vocabulary names it, and the items its first
 * line says it's made from ("Armor (Chain Mail or Chain Shirt)").
 */

import { ITEM_RARITIES } from "@/vocabulary/dnd5/itemTemplates.ts";

/** A magic item's rarity, as the vocabulary names it. */
export type ItemRarity = (typeof ITEM_RARITIES)[number];

/** A magic weapon's or armor's first line: what it is, and the items it's made from ("Weapon (Longbow or Shortbow)"). */
const BASE_LINE = /^(?:Armor|Weapon) \((.+)\)$/;

/**
 * The items a magic weapon's or armor's first line says it's made from, by name: none for any of a kind ("Any Simple
 * or Martial", "Any Medium or Heavy, Except Hide Armor"), or a first line of another kind of item.
 */
export function readBaseItems(line: string): string[] {
  const inner = BASE_LINE.exec(line.trim())?.[1];
  if (!inner || /^Any\b/.test(inner)) return [];
  return inner
    .split(/,? or |, /)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * A magic item's rarity as the vocabulary names it: "Rarity Varies" is "Varies", and a variant's bonus after it is
 * left out ("Uncommon (+1)": Uncommon). None for a rarity of several, a family's that names its variants' ("Uncommon
 * (+1), Rare (+2), or Very Rare (+3)").
 */
export function readRarity(rarity: string): ItemRarity | undefined {
  if (rarity === "Rarity Varies") return "Varies";
  const bare = rarity.replace(/\s*\([^)]*\)$/, "");
  return ITEM_RARITIES.find((known) => known === bare);
}
