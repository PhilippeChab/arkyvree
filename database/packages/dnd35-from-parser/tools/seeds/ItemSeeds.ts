/** An item reference's seeds: its weapons, armor, shields and goods. */

import { type ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { getArmorDefinition, getShieldDefinition } from "@/database/packages/dnd35/content/items/armor.ts";
import {
  exotic,
  HEAVY_ARMOR_PROF,
  LIGHT_ARMOR_PROF,
  martial,
  MEDIUM_ARMOR_PROF,
  SHIELD_PROF,
  simple,
  TOWER_SHIELD_PROF,
} from "@/database/packages/dnd35/content/items/proficiencies.ts";
import {
  armorProperties,
  shieldProperties,
  weaponProperties,
} from "@/database/packages/dnd35/content/items/properties.ts";
import type { ItemSeed } from "@/database/packages/dnd35/content/items/types.ts";

import { ReferenceSeeds } from "./ReferenceSeeds.ts";

export type ItemSeedSets = {
  armor: ItemSeed[];
  exoticWeapons: ItemSeed[];
  goods: ItemSeed[];
  martialWeapons: ItemSeed[];
  shields: ItemSeed[];
  simpleWeapons: ItemSeed[];
};

/**
 * An item reference's seeds, by category (`seeds`): each item whole, its requirements (being proficient with it) and
 * its properties (its weapon, armor or shield type's) built from its name; and the weight of each weapon, armor and
 * shield (`weights`), which an item made from one weighs.
 */
export class ItemSeeds extends ReferenceSeeds<ItemReference> {
  /** The proficiency an armor of `category` requires: light armor's for one without a category. */
  static armorProficiency(category: string | undefined): RequirementEntry[] {
    if (category === "Medium") return MEDIUM_ARMOR_PROF;
    if (category === "Heavy") return HEAVY_ARMOR_PROF;
    return LIGHT_ARMOR_PROF;
  }

  /** Its seeds, by category, each built from its mapping. */
  seeds(): ItemSeedSets {
    return this.memo("seeds", () => {
      const simpleWeapons: ItemSeed[] = [];
      const martialWeapons: ItemSeed[] = [];
      const exoticWeapons: ItemSeed[] = [];
      const armor: ItemSeed[] = [];
      const shields: ItemSeed[] = [];
      const goods: ItemSeed[] = [];

      // Build weapons
      for (const [srdName, det] of Object.entries(this.ref.detected.weapons)) {
        if (!det.generatorName) continue;
        const item = this.ref.mapping.weapons[srdName];
        if (item.skip) continue;
        const { costGp, weight } = item;
        // Find the raw entry for category info
        const rawWeapon = this.ref.raw.weapons.find((w) => w.name === srdName);
        const category = rawWeapon?.category?.replace(/ Weapons?$/, "").toLowerCase() ?? "";
        const description =
          item.description ?? `A ${category ? `${category} ` : ""}${det.proficiency.toLowerCase()} weapon.`;

        const seed: ItemSeed = {
          name: det.generatorName,
          description,
          weight,
          costGp,
          type: "Weapon",
          requirements:
            det.proficiency === "Simple"
              ? simple(det.generatorName)
              : det.proficiency === "Martial"
                ? martial(det.generatorName)
                : exotic(det.generatorName),
          properties: weaponProperties(det.generatorName),
        };

        if (det.proficiency === "Simple") simpleWeapons.push(seed);
        else if (det.proficiency === "Martial") martialWeapons.push(seed);
        else exoticWeapons.push(seed);
      }

      // Build armor & shields
      for (const [srdName, det] of Object.entries(this.ref.detected.armor)) {
        if (!det.generatorName) continue;
        const item = this.ref.mapping.armor[srdName];
        if (item.skip) continue;
        const { costGp, weight } = item;
        const categoryLabel = det.proficiencyCategory.replace(/ armor$/i, "");
        const description = item.description ?? `${det.type === "Shield" ? "A shield" : `${categoryLabel} armor`}.`;

        const seed: ItemSeed = {
          name: det.generatorName,
          description,
          weight,
          costGp,
          type: det.type,
          ...(det.type === "Armor"
            ? {
                slot: "Torso" as const,
                requirements: ItemSeeds.armorProficiency(getArmorDefinition(det.generatorName)?.armorType),
                properties: armorProperties(det.generatorName),
              }
            : {
                slot: "Off Hand" as const,
                requirements:
                  getShieldDefinition(det.generatorName)?.shieldType === "Tower" ? TOWER_SHIELD_PROF : SHIELD_PROF,
                properties: shieldProperties(det.generatorName),
              }),
        };

        if (det.type === "Shield") shields.push(seed);
        else armor.push(seed);
      }

      // Build goods
      for (const name of Object.keys(this.ref.detected.goods)) {
        const item = this.ref.mapping.goods[name];
        if (item.skip) continue;

        goods.push({
          name,
          description: item.description ?? "",
          weight: item.weight,
          costGp: item.costGp,
          type: "Other",
          slot: "Other" as const,
          properties: [],
        });
      }

      return { simpleWeapons, martialWeapons, exoticWeapons, armor, shields, goods };
    });
  }

  /** The weight of each weapon, armor and shield it seeds, by name: what an item made from one weighs. */
  weights(): Record<string, string> {
    const { simpleWeapons, martialWeapons, exoticWeapons, armor, shields } = this.seeds();
    const bases = [...simpleWeapons, ...martialWeapons, ...exoticWeapons, ...armor, ...shields];
    return Object.fromEntries(bases.map((item) => [item.name, item.weight]));
  }
}
