import { readCost, readVariantAmounts, readWeight } from "@/codegen/pf1/tools/detect/amounts.ts";
import type { ItemEntry, ItemReference } from "@/codegen/pf1/tools/types/items.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { armorFields, shieldFields, weaponFields } from "@/content/pf1/builders/items/fields.ts";
import {
  exotic,
  HEAVY_ARMOR_PROF,
  LIGHT_ARMOR_PROF,
  martial,
  MEDIUM_ARMOR_PROF,
  SHIELD_PROF,
  simple,
  TOWER_SHIELD_PROF,
} from "@/content/pf1/builders/items/proficiencies.ts";
import type { Pf1ItemSeed } from "@/content/pf1/builders/items/types.ts";
import {
  ARMOR_TYPE_DEFINITIONS,
  ARMOR_TYPE_NAMES,
  SHIELD_TYPE_DEFINITIONS,
  SHIELD_TYPE_NAMES,
} from "@/vocabulary/pf1/armor.ts";
import { ITEM_COST_GP, ITEM_IS_TEMPLATE, ITEM_SLOT, ITEM_TYPE, ITEM_WEIGHT } from "@/vocabulary/pf1/fields/index.ts";
import { WEAPON_TYPE_DEFINITIONS, WEAPON_TYPE_NAMES } from "@/vocabulary/pf1/weapons.ts";

import { Memos } from "./Memos.ts";

/** An item reference's seeds, by the file each kind is written to. */
export interface ItemSeedSets {
  armor: Pf1ItemSeed[];
  exoticWeapons: Pf1ItemSeed[];
  goods: Pf1ItemSeed[];
  martialWeapons: Pf1ItemSeed[];
  shields: Pf1ItemSeed[];
  simpleWeapons: Pf1ItemSeed[];
}

/** The weapon table's rows that are no weapon a character wields: ammunition, siege engines, the unarmed strike. */
const NOT_WIELDED = new Set(["Ammunition", "Siege Engine"]);

/** The names the book's tables give a weapon that its vocabulary's name isn't, lowercase: its light flail is the flail. */
const WEAPON_ALIASES: Record<string, string> = { "light flail": "Flail" };

/**
 * The base item of `names` (a vocabulary's) a table's row names, by its name, or its name and `suffix` ("Leather"
 * armor), whatever their case.
 */
function baseNamed(row: string, names: string[], suffix?: string): string | undefined {
  const lower = row.toLowerCase();
  const written = suffix ? [lower, `${lower} ${suffix}`] : [lower];
  return names.find((name) => written.includes(name.toLowerCase()));
}

/** The variant `listed` names, by its note in parentheses ("Lock (good)": "good"): none for a name without one. */
function noteOf(listed: string): string | undefined {
  return listed.match(/\(([^)]+)\)$/)?.[1].toLowerCase();
}

/** The weapon a weapon table's row is, by its name ("Bastard sword", "Shuriken (5)"): none for a row that's none. */
function weaponNamed(row: string): string | undefined {
  const name = row.replace(/\s*\(\d+\)$/, "");
  return WEAPON_ALIASES[name.toLowerCase()] ?? baseNamed(name, WEAPON_TYPE_NAMES);
}

/**
 * An item reference's seeds, by kind (`seeds`): its weapons, armor and shields, each a template others are made from,
 * named and built as its vocabulary's (`weaponFields`, `armorFields`, `shieldFields`, the proficiency it takes), with
 * its cost and weight as its book prices it; and its goods, a seed per variant its book lists (`listedAs`: "Lock
 * (good)"), each priced as its line prices that variant. What its tables list that's no item a character uses
 * (ammunition, siege engines, armor extras, the shields as weapons) is left out (`leftOut`).
 */
export class ItemSeeds {
  constructor(readonly ref: ItemReference) {}

  /** The proficiency an armor of `category` requires. */
  static armorProficiency(category: string | undefined): RequirementEntry[] {
    if (category === "Medium") return MEDIUM_ARMOR_PROF;
    if (category === "Heavy") return HEAVY_ARMOR_PROF;
    return LIGHT_ARMOR_PROF;
  }

  /** What it built, by what it is. */
  private readonly memos = new Memos();

  /** An armor's or a shield's seed, by the armor (`armor`) or the shield (`shield`) its row names: none for neither. */
  private armorSeed(entry: ItemEntry): { kind: "armor" | "shields"; seed: Pf1ItemSeed } | undefined {
    const own = this.ownFields(entry, entry.fields.Cost);
    const armor = baseNamed(entry.name, ARMOR_TYPE_NAMES, "armor");
    if (armor) {
      const requirements = ItemSeeds.armorProficiency(ARMOR_TYPE_DEFINITIONS[armor]?.armorType);
      const fields = { ...own, [ITEM_TYPE]: "Armor", [ITEM_SLOT]: "Armor", ...armorFields(armor) };
      return { kind: "armor", seed: { name: armor, description: entry.description, requirements, fields } };
    }
    const shield = baseNamed(entry.name, SHIELD_TYPE_NAMES, "shield");
    if (!shield) return undefined;
    const requirements = SHIELD_TYPE_DEFINITIONS[shield]?.shieldType === "Tower" ? TOWER_SHIELD_PROF : SHIELD_PROF;
    const fields = { ...own, [ITEM_TYPE]: "Shield", [ITEM_SLOT]: "Off Hand", ...shieldFields(shield) };
    return { kind: "shields", seed: { name: shield, description: entry.description, requirements, fields } };
  }

  /** A good's seeds: one per variant its book lists, each priced and weighed as its lines give that variant. */
  private goodSeeds(entry: ItemEntry): Pf1ItemSeed[] {
    const prices = readVariantAmounts(entry.fields.Price ?? "");
    const weights = readVariantAmounts(entry.fields.Weight ?? "");
    return entry.listedAs.map((listed) => {
      const note = noteOf(listed);
      const price = (note && prices.get(note)) ?? entry.fields.Price ?? "";
      const weight = (note && weights.get(note)) ?? entry.fields.Weight ?? "";
      return {
        name: listed,
        description: entry.description,
        fields: {
          [ITEM_COST_GP]: readCost(price),
          [ITEM_WEIGHT]: readWeight(weight),
          [ITEM_TYPE]: "Other",
          [ITEM_SLOT]: "Other",
        },
      };
    });
  }

  /** A template's own fields: its cost (`cost`, its row's) and weight, and that it's a template. */
  private ownFields(entry: ItemEntry, cost: string | undefined) {
    return {
      [ITEM_COST_GP]: readCost(cost ?? ""),
      [ITEM_WEIGHT]: readWeight(entry.fields.Weight ?? ""),
      [ITEM_IS_TEMPLATE]: true,
    };
  }

  /** A weapon's seed, by the weapon its row names: none for a row that's no weapon a character wields. */
  private weaponSeed(entry: ItemEntry): Pf1ItemSeed | undefined {
    const weapon = NOT_WIELDED.has(entry.fields.Proficiency ?? "") ? undefined : weaponNamed(entry.name);
    if (!weapon) return undefined;
    const proficiency = WEAPON_TYPE_DEFINITIONS[weapon]!.proficiency;
    const description =
      entry.description || `A ${(entry.fields.Category ?? "").toLowerCase()} ${proficiency.toLowerCase()} weapon.`;
    return {
      name: weapon,
      description,
      requirements:
        proficiency === "Simple" ? simple(weapon) : proficiency === "Martial" ? martial(weapon) : exotic(weapon),
      fields: { ...this.ownFields(entry, entry.fields.Cost), [ITEM_TYPE]: "Weapon", ...weaponFields(weapon) },
    };
  }

  /** The rows of its tables that are no item it seeds, each "category: name". */
  leftOut(): string[] {
    return this.ref.raw
      .filter((entry) =>
        entry.category === "weapon" ? !this.weaponSeed(entry) : entry.category === "armor" && !this.armorSeed(entry),
      )
      .map((entry) => `${entry.category}: ${entry.name}`);
  }

  /** Its seeds, by the file each kind is written to: its weapons by proficiency, its armor, shields and goods. */
  seeds(): ItemSeedSets {
    return this.memos.of("seeds", () => {
      const sets: ItemSeedSets = {
        simpleWeapons: [],
        martialWeapons: [],
        exoticWeapons: [],
        armor: [],
        shields: [],
        goods: [],
      };
      for (const entry of this.ref.raw) {
        if (entry.category === "goods") {
          sets.goods.push(...this.goodSeeds(entry));
        } else if (entry.category === "armor") {
          const armor = this.armorSeed(entry);
          if (armor) sets[armor.kind].push(armor.seed);
        } else {
          const weapon = this.weaponSeed(entry);
          const proficiency = weapon && WEAPON_TYPE_DEFINITIONS[weapon.name]!.proficiency;
          if (weapon) sets[`${proficiency!.toLowerCase() as "simple" | "martial" | "exotic"}Weapons`].push(weapon);
        }
      }
      return sets;
    });
  }

  /** The weight of each weapon, armor and shield it seeds, by name: what an item made from one weighs. */
  weights(): Record<string, number> {
    const { simpleWeapons, martialWeapons, exoticWeapons, armor, shields } = this.seeds();
    const bases = [...simpleWeapons, ...martialWeapons, ...exoticWeapons, ...armor, ...shields];
    return Object.fromEntries(bases.map((item) => [item.name, Number(item.fields[ITEM_WEIGHT] ?? 0)]));
  }
}
