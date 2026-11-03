/** A magic item reference's seeds: its Dnd35ItemSeed[], by category. */

import { type MagicItemCategory, type MagicItemReference } from "@/codegen/dnd3.5/tools/types/magicItems.ts";
import { armorFields } from "@/content/dnd3.5/builders/items/fields.ts";
import type { Dnd35ItemSeed, ItemFields } from "@/content/dnd3.5/builders/items/types.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd3.5/equipment.ts";
import {
  ARMOR_PROFICIENCY,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
} from "@/vocabulary/dnd3.5/fields/index.ts";

import { ItemSeeds } from "./ItemSeeds.ts";
import { ReferenceSeeds } from "./ReferenceSeeds.ts";

export interface MagicItemSeedSets {
  magicArmor: Dnd35ItemSeed[];
  magicShields: Dnd35ItemSeed[];
  magicWeapons: Dnd35ItemSeed[];
  rings: Dnd35ItemSeed[];
  rods: Dnd35ItemSeed[];
  staffs: Dnd35ItemSeed[];
  wondrousItems: Dnd35ItemSeed[];
}

/** The word a ring's, a rod's or a staff's name holds, prefixed when the SRD heading is just the bare name. */
const CATEGORY_PREFIX: Partial<Record<MagicItemCategory, string>> = { ring: "Ring", rod: "Rod", staff: "Staff" };

/**
 * A template of `fields` (an item's own, its armor's under them): a template, made from none, whose requirements are
 * the proficiency with it, by its category.
 */
function templateOf(fields: ItemFields): Pick<Dnd35ItemSeed, "requirements" | "fields"> {
  return {
    requirements: ItemSeeds.armorProficiency(fields[ARMOR_PROFICIENCY]),
    fields: { ...fields, [ITEM_IS_TEMPLATE]: true },
  };
}

/**
 * A magic item reference's seeds, by kind (`seeds`), as their mapping makes them (their overrides applied, the stats
 * their text gives): an item made from a base one weighs what its base does, the book's base item's (`ItemSeeds`).
 */
export class MagicItemSeeds extends ReferenceSeeds<MagicItemReference> {
  /**
   * The magic items a magic item reference seeds (those its mapping doesn't skip), each with its mapping and its slot,
   * checked when it has one. Generation throws a slot's problem, and `parser:dnd3.5:validate` reports it.
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
      const magicArmor: Dnd35ItemSeed[] = [];
      const magicShields: Dnd35ItemSeed[] = [];
      const magicWeapons: Dnd35ItemSeed[] = [];
      const wondrousItems: Dnd35ItemSeed[] = [];
      const rings: Dnd35ItemSeed[] = [];
      const rods: Dnd35ItemSeed[] = [];
      const staffs: Dnd35ItemSeed[] = [];

      const categoryBuckets: Record<MagicItemCategory, Dnd35ItemSeed[]> = {
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
        // Its mapping's weight (its override's or its text's), else its base item's, else none (0, as detected)
        const weight = item.weight ?? (sourceItem ? baseWeights[sourceItem] : undefined) ?? det.weight;

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

        // A template is made from nothing: its base armor's fields are its own, under those it changes
        if (item.template && (det.category !== "specificArmor" || !sourceItem))
          throw new Error(`${name}: only a specific armor made from a base armor can be a template`);

        const own: ItemFields = {
          [ITEM_COST_GP]: item.costGp,
          [ITEM_WEIGHT]: weight,
          [ITEM_TYPE]: det.itemType,
          ...(slot && { [ITEM_SLOT]: this.checkedValue(slot) }),
        };
        bucket.push({
          name: itemName,
          description: item.description,
          ...(item.template && sourceItem
            ? templateOf({ ...own, ...armorFields(sourceItem), ...item.fields })
            : { fields: { ...own, ...item.fields }, ...(sourceItem ? { links: { madeFrom: sourceItem } } : {}) }),
          ...(item.modifiers.length ? { modifiers: item.modifiers } : {}),
        });
      }

      return { magicArmor, magicShields, magicWeapons, wondrousItems, rings, rods, staffs };
    });
  }
}
