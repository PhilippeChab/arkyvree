/** A magic item reference's seeds: its ItemSeed[], by category. */

import {
  type MagicItemCategory,
  type MagicItemReference,
} from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { Property } from "@/database/packages/dnd35/content/customization/types.ts";
import { armorProperties } from "@/database/packages/dnd35/content/items/properties.ts";
import type { ItemSeed } from "@/database/packages/dnd35/content/items/types.ts";
import { ARMOR_PROFICIENCY } from "@/shared/dnd3.5/properties/index.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

import { checkOneOf, getCheckedValue } from "./checks.ts";
import { getArmorProficiency } from "./items.ts";

export type MagicItemSeedSets = {
  magicArmor: ItemSeed[];
  magicShields: ItemSeed[];
  magicWeapons: ItemSeed[];
  rings: ItemSeed[];
  rods: ItemSeed[];
  staffs: ItemSeed[];
  wondrousItems: ItemSeed[];
};

/** The word a ring's, a rod's or a staff's name holds, prefixed when the SRD heading is just the bare name. */
const CATEGORY_PREFIX: Partial<Record<MagicItemCategory, string>> = { ring: "Ring", rod: "Rod", staff: "Staff" };

/** A template made of `properties`: its requirements are the proficiency with it, by its category. */
function templateOf(properties: Property[]): Pick<ItemSeed, "isTemplate" | "requirements" | "properties"> {
  const category = properties.find((property) => property.type === ARMOR_PROFICIENCY)?.value;
  return { isTemplate: true, requirements: getArmorProficiency(category), properties };
}

/** The properties of `base`, those of `own` over them by type. */
function withOwnProperties(base: Property[], own: Property[]): Property[] {
  const ownTypes = new Set(own.map((property) => property.type));
  return [...base.filter((property) => !ownTypes.has(property.type)), ...own];
}

/**
 * The magic item seeds, by kind, as their mapping makes them (their overrides applied, the stats their text gives): an
 * item made from a base one weighs what its base does (`baseWeights`, by name) unless it says otherwise.
 */
export function buildMagicItemSeeds(
  ref: MagicItemReference,
  baseWeights: Record<string, string> = {},
): MagicItemSeedSets {
  const magicArmor: ItemSeed[] = [];
  const magicShields: ItemSeed[] = [];
  const magicWeapons: ItemSeed[] = [];
  const wondrousItems: ItemSeed[] = [];
  const rings: ItemSeed[] = [];
  const rods: ItemSeed[] = [];
  const staffs: ItemSeed[] = [];

  const categoryBuckets: Record<MagicItemCategory, ItemSeed[]> = {
    specificArmor: magicArmor,
    specificShield: magicShields,
    specificWeapon: magicWeapons,
    wondrousItem: wondrousItems,
    ring: rings,
    rod: rods,
    staff: staffs,
  };

  for (const { name, det, item, slot } of getSeededMagicItems(ref)) {
    const sourceItem = item.baseItem;
    const weight = item.weight ?? (sourceItem && baseWeights[sourceItem]) ?? det.weight;

    const bucket = categoryBuckets[det.category];
    if (!bucket) throw new Error(`${name}: the seed has no magic items of the category "${det.category}"`);

    const categoryWord = CATEGORY_PREFIX[det.category];
    let itemName = name;
    if (categoryWord) {
      // Normalize plural category in name: "Metamagic Rods" → "Metamagic Rod"
      itemName = itemName
        .replace(/\bRods\b/g, "Rod")
        .replace(/\bRings\b/g, "Ring")
        .replace(/\bStaffs\b/g, "Staff");
      if (!new RegExp(`\\b${categoryWord}\\b`, "i").test(itemName)) itemName = `${categoryWord} of ${itemName}`;
    }

    // A template is made from nothing: its base armor's properties are its own, under those it changes
    if (item.template && (det.category !== "specificArmor" || !sourceItem))
      throw new Error(`${name}: only a specific armor made from a base armor can be a template`);

    bucket.push({
      name: itemName,
      description: item.description,
      weight,
      costGp: item.costGp,
      type: det.itemType,
      slot: slot && getCheckedValue(slot),
      ...(item.template && sourceItem
        ? templateOf(withOwnProperties(armorProperties(sourceItem), item.properties))
        : { properties: item.properties, ...(sourceItem ? { sourceItem } : {}) }),
      ...(item.modifiers.length ? { modifiers: item.modifiers } : {}),
    });
  }

  return { magicArmor, magicShields, magicWeapons, wondrousItems, rings, rods, staffs };
}

/**
 * The magic items a magic item reference seeds (those its mapping doesn't skip), each with its mapping and its slot,
 * checked when it has one. Generation throws a slot's problem, and `parser:validate` reports it.
 */
export function getSeededMagicItems(ref: MagicItemReference) {
  return Object.entries(ref.detected).flatMap(([name, det]) => {
    const item = ref.mapping[name];
    if (item.skip) return [];
    return [
      { name, det, item, slot: item.slot ? checkOneOf(item.slot, LOCATION_OPTIONS, `${name}'s slot`) : undefined },
    ];
  });
}
