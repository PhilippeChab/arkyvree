import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import { getArmorDefinition, getShieldDefinition } from "@/database/packages/dnd35/content/items/armor.ts";
import { getWeaponDefinition } from "@/database/packages/dnd35/content/items/weapons.ts";

import { readCost, readWeight } from "./readers/items/amounts.ts";

/** SRD armor table uses short names; generators use full names */
const DEFAULT_ARMOR_NAME_MAP: Record<string, string> = {
  Padded: "Padded Armor",
  Leather: "Leather Armor",
  "Studded leather": "Studded Leather",
  "Chain shirt": "Chain Shirt",
  Hide: "Hide Armor",
  "Scale mail": "Scale Mail",
  Chainmail: "Chain Mail",
  "Splint mail": "Splint Mail",
  "Banded mail": "Banded Mail",
  "Half-plate": "Half-Plate",
  "Full plate": "Full Plate",
  "Shield, light wooden": "Light Wooden Shield",
  "Shield, light steel": "Light Steel Shield",
  "Shield, heavy wooden": "Heavy Wooden Shield",
  "Shield, heavy steel": "Heavy Steel Shield",
  "Shield, tower": "Tower Shield",
};

/** SRD armor extras that aren't standalone equipment */
const DEFAULT_ARMOR_SKIPS = new Set(["Armor spikes", "Gauntlet, locked", "Shield spikes"]);

/** SRD weapon table uses "Adjective, Noun" format; generators use "Noun Adjective" */
const DEFAULT_WEAPON_NAME_MAP: Record<string, string> = {
  "Dagger, punching": "Punching Dagger",
  "Gauntlet, spiked": "Spiked Gauntlet",
  "Mace, light": "Light Mace",
  "Mace, heavy": "Heavy Mace",
  "Crossbow, heavy": "Heavy Crossbow",
  "Crossbow, light": "Light Crossbow",
  "Axe, throwing": "Throwing Axe",
  "Hammer, light": "Light Hammer",
  "Pick, light": "Light Pick",
  "Pick, heavy": "Heavy Pick",
  "Sword, short": "Shortsword",
  "Sword, bastard": "Bastard Sword",
  "Sword, two-bladed": "Two-Bladed Sword",
  "Flail, dire": "Dire Flail",
  "Flail, heavy": "Heavy Flail",
  "Hammer, gnome hooked": "Gnome Hooked Hammer",
  "Axe, orc double": "Orc Double Axe",
  "Urgrosh, dwarven": "Dwarven Urgrosh",
  "Waraxe, dwarven": "Dwarven Waraxe",
  "Chain, spiked": "Spiked Chain",
  "Crossbow, hand": "Hand Crossbow",
  "Crossbow, repeating heavy": "Repeating Heavy Crossbow",
  "Crossbow, repeating light": "Repeating Light Crossbow",
  "Shortbow, composite": "Composite Shortbow",
  "Longbow, composite": "Composite Longbow",
  "Shuriken (5)": "Shuriken",
};

/** SRD weapons that shouldn't become item entries */
const DEFAULT_WEAPON_SKIPS = new Set([
  "Unarmed strike",
  "Shield, light",
  "Shield, heavy",
  "Spiked armor",
  "Spiked shield, light",
  "Spiked shield, heavy",
]);

const TABLE_CATEGORIES: Record<string, string> = {
  tableAdventuringGear: "Adventuring Gear",
  tableSpecialSubstancesAndItems: "Special Substances and Items",
  tableToolsAndSkillKits: "Tools and Skill Kits",
  tableClothing: "Clothing",
  tableFoodDrinkAndLodging: "Food, Drink, and Lodging",
  tableMountsAndRelatedGear: "Mounts and Related Gear",
  tableTransport: "Transport",
};

/** Ammunition — not equippable weapons */
function isAmmunition(name: string): boolean {
  return /^(Arrows|Bolts|Bullets)\b/.test(name);
}

function resolveArmorName(srdName: string, overrideNameMap?: Record<string, string>): string {
  if (overrideNameMap?.[srdName]) return overrideNameMap[srdName];
  if (DEFAULT_ARMOR_NAME_MAP[srdName]) return DEFAULT_ARMOR_NAME_MAP[srdName];
  return srdName;
}

function resolveWeaponName(srdName: string, overrideNameMap?: Record<string, string>): string {
  if (overrideNameMap?.[srdName]) return overrideNameMap[srdName];
  if (DEFAULT_WEAPON_NAME_MAP[srdName]) return DEFAULT_WEAPON_NAME_MAP[srdName];
  return srdName;
}

export function buildItemDetected(
  raw: ItemReference["raw"],
  overrideNameMap?: Record<string, string>,
): ItemReference["detected"] {
  const weapons: ItemReference["detected"]["weapons"] = {};
  const armor: ItemReference["detected"]["armor"] = {};
  const goods: ItemReference["detected"]["goods"] = {};

  for (const w of raw.weapons) {
    if (DEFAULT_WEAPON_SKIPS.has(w.name)) continue;
    if (isAmmunition(w.name)) continue;

    const resolved = resolveWeaponName(w.name, overrideNameMap);
    const def = getWeaponDefinition(resolved);

    weapons[w.name] = {
      generatorName: def ? resolved : null,
      proficiency: w.proficiency,
      costGp: readCost(w.cost),
      weight: readWeight(w.weight),
    };
  }

  for (const a of raw.armor) {
    if (DEFAULT_ARMOR_SKIPS.has(a.name)) continue;
    if (a.category === "Extras") continue;

    const isShieldCategory = a.category === "Shields";
    const resolved = resolveArmorName(a.name, overrideNameMap);
    const def = isShieldCategory ? getShieldDefinition(resolved) : getArmorDefinition(resolved);
    const itemType: "Armor" | "Shield" = isShieldCategory ? "Shield" : "Armor";

    armor[a.name] = {
      generatorName: def ? resolved : null,
      type: itemType,
      proficiencyCategory: a.category,
      costGp: readCost(a.cost),
      weight: readWeight(a.weight),
    };
  }

  for (const g of raw.goods) {
    goods[g.name] = {
      costGp: readCost(g.cost),
      weight: readWeight(g.weight),
      category: TABLE_CATEGORIES[g.tableId] ?? g.tableId,
    };
  }

  return { weapons, armor, goods, unresolved: findUnresolvedItems({ weapons, armor }) };
}

/**
 * The weapons, armor and shields the generator has no definition of, and leaves out ("weapon: Name"): all of them, or
 * those `skipped` doesn't name.
 */
export function findUnresolvedItems(
  { weapons, armor }: Pick<ItemReference["detected"], "weapons" | "armor">,
  skipped = (_name: string) => false,
): string[] {
  return [
    ...Object.entries(weapons)
      .filter(([name, weapon]) => !weapon.generatorName && !skipped(name))
      .map(([name]) => `weapon: ${name}`),
    ...Object.entries(armor)
      .filter(([name, piece]) => !piece.generatorName && !skipped(name))
      .map(([name, piece]) => `${piece.type.toLowerCase()}: ${name}`),
  ];
}
