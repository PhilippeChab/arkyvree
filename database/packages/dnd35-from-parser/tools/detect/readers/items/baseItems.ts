/**
 * The base item a specific magic weapon, armor or shield is made from, by the template names of the base weapons,
 * armors and shields (longest first, so "Heavy Crossbow" wins over "Crossbow").
 */

import type { MagicItemCategory } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";

/** Common alternative spellings in SRD descriptions → canonical template name, scoped by category */
const ALIASES: Partial<Record<MagicItemCategory, Record<string, string>>> = {
  specificWeapon: {
    "short sword": "Shortsword",
  },
  specificArmor: {
    chainmail: "Chain Mail",
    "chain mail": "Chain Mail",
    "plate armor": "Full Plate",
  },
  specificShield: {
    "heavy shield": "Heavy Steel Shield",
  },
};

/** The base armors' template names, longest first. */
const BASE_ARMOR = [
  "Studded Leather",
  "Leather Armor",
  "Padded Armor",
  "Chain Shirt",
  "Hide Armor",
  "Scale Mail",
  "Chain Mail",
  "Breastplate",
  "Splint Mail",
  "Banded Mail",
  "Half-Plate",
  "Full Plate",
];

/** The base shields' template names, longest first. */
const BASE_SHIELDS = [
  "Light Wooden Shield",
  "Light Steel Shield",
  "Heavy Wooden Shield",
  "Heavy Steel Shield",
  "Tower Shield",
  "Buckler",
];

/** The base weapons' template names, longest first. */
const BASE_WEAPONS = [
  "Repeating Heavy Crossbow",
  "Repeating Light Crossbow",
  "Gnome Hooked Hammer",
  "Two-Bladed Sword",
  "Composite Longbow",
  "Composite Shortbow",
  "Dwarven Urgrosh",
  "Orc Double Axe",
  "Spiked Gauntlet",
  "Punching Dagger",
  "Hand Crossbow",
  "Heavy Crossbow",
  "Light Crossbow",
  "Dwarven Waraxe",
  "Bastard Sword",
  "Spiked Chain",
  "Throwing Axe",
  "Light Hammer",
  "Morningstar",
  "Heavy Flail",
  "Heavy Mace",
  "Heavy Pick",
  "Light Mace",
  "Light Pick",
  "Dire Flail",
  "Battleaxe",
  "Greatclub",
  "Greatsword",
  "Greataxe",
  "Longsword",
  "Shortsword",
  "Warhammer",
  "Guisarme",
  "Nunchaku",
  "Shortspear",
  "Longspear",
  "Quarterstaff",
  "Falchion",
  "Scimitar",
  "Halberd",
  "Ranseur",
  "Handaxe",
  "Trident",
  "Longbow",
  "Shortbow",
  "Siangham",
  "Shuriken",
  "Gauntlet",
  "Dagger",
  "Sickle",
  "Rapier",
  "Lance",
  "Glaive",
  "Kukri",
  "Flail",
  "Spear",
  "Club",
  "Whip",
  "Dart",
  "Javelin",
  "Sling",
  "Scythe",
  "Kama",
  "Sap",
  "Bolas",
  "Net",
  "Sai",
];

/** The base item a specific weapon, armor or shield is made from: the one its description names, else its name. */
export function readBaseItem(name: string, description: string, category: MagicItemCategory): string | undefined {
  let candidates: string[];
  if (category === "specificWeapon") candidates = BASE_WEAPONS;
  else if (category === "specificArmor") candidates = BASE_ARMOR;
  else if (category === "specificShield") candidates = BASE_SHIELDS;
  else return undefined;

  const lowerDesc = description.toLowerCase();

  // Check category-scoped aliases first (e.g., "chainmail" → "Chain Mail" for armor only)
  const categoryAliases = ALIASES[category];
  if (categoryAliases)
    for (const [alias, canonical] of Object.entries(categoryAliases)) if (lowerDesc.includes(alias)) return canonical;

  for (const base of candidates) if (lowerDesc.includes(base.toLowerCase())) return base;

  const lowerName = name.toLowerCase();
  for (const base of candidates) if (lowerName.includes(base.toLowerCase())) return base;

  return undefined;
}
