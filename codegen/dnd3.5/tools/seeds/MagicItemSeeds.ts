/** A magic item reference's seeds: its ItemSeed[], by category. */

import { type MagicItemCategory, type MagicItemReference } from "@/codegen/dnd3.5/tools/types/magicItems.ts";
import type { Property } from "@/content/core/builders/customization/types.ts";
import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import { armorProperties } from "@/content/dnd3.5/builders/items/properties.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";
import { ARMOR_PROFICIENCY } from "@/vocabulary/dnd3.5/properties/index.ts";

import { ItemSeeds } from "./ItemSeeds.ts";
import { ReferenceSeeds } from "./ReferenceSeeds.ts";

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
  return { isTemplate: true, requirements: ItemSeeds.armorProficiency(category), properties };
}

/** The properties of `base`, those of `own` over them by type. */
function withOwnProperties(base: Property[], own: Property[]): Property[] {
  const ownTypes = new Set(own.map((property) => property.type));
  return [...base.filter((property) => !ownTypes.has(property.type)), ...own];
}

/**
 * A magic item reference's seeds, by kind (`seeds`), as their mapping makes them (their overrides applied, the stats
 * their text gives): an item made from a base one weighs what its base does, the book's base item's (`ItemSeeds`).
 */
export class MagicItemSeeds extends ReferenceSeeds<MagicItemReference> {
  /**
   * The magic items a magic item reference seeds (those its mapping doesn't skip), each with its mapping and its slot,
   * checked when it has one. Generation throws a slot's problem, and `parser:validate` reports it.
   */
  seeded() {
    return Object.entries(this.ref.detected).flatMap(([name, det]) => {
      const item = this.ref.mapping[name];
      if (item.skip) return [];
      return [
        {
          name,
          det,
          item,
          slot: item.slot ? this.checkOneOf(item.slot, LOCATION_OPTIONS, `${name}'s slot`) : undefined,
        },
      ];
    });
  }

  /** Its seeds, by kind: a slot or a category the seed doesn't accept throws. */
  seeds(): MagicItemSeedSets {
    return this.memo("seeds", () => {
      const baseWeights = this.book.baseItemWeights();
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

      for (const { name, det, item, slot } of this.seeded()) {
        const sourceItem = item.baseItem;
        // Its mapping's weight (its override's or its text's), else its base item's, else none ("0", as detected)
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
          slot: slot && this.checkedValue(slot),
          ...(item.template && sourceItem
            ? templateOf(withOwnProperties(armorProperties(sourceItem), item.properties))
            : { properties: item.properties, ...(sourceItem ? { sourceItem } : {}) }),
          ...(item.modifiers.length ? { modifiers: item.modifiers } : {}),
        });
      }

      return { magicArmor, magicShields, magicWeapons, wondrousItems, rings, rods, staffs };
    });
  }
}
