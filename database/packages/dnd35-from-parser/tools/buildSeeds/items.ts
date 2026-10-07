/** An item reference's seeds: its ItemDef[], by category. */

import { type ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { ItemDef } from "@/database/packages/dnd35/content/items/types.ts";

export type ItemSeedSets = {
  simpleWeapons: ItemDef[];
  martialWeapons: ItemDef[];
  exoticWeapons: ItemDef[];
  armor: ItemDef[];
  shields: ItemDef[];
  goods: ItemDef[];
};

/** The reference's armor and shields: those the generator has a definition of, unless skipped. */
function buildArmorSeeds(ref: ItemReference): Pick<ItemSeedSets, "armor" | "shields"> {
  const armor: ItemDef[] = [];
  const shields: ItemDef[] = [];
  for (const [srdName, det] of Object.entries(ref.detected.armor)) {
    if (!det.generatorName) continue;
    const item = correctedItem(ref, srdName, det);
    if (!item) continue;
    const { costGp, weight } = item;
    const categoryLabel = det.proficiencyCategory.replace(/ armor$/i, "");
    const description = item.description ?? `${det.type === "Shield" ? "A shield" : `${categoryLabel} armor`}.`;

    const seed: ItemDef = {
      name: det.generatorName,
      description,
      weight,
      costGp,
      type: det.type,
      ...(det.type === "Armor" ? { slot: "Torso" as const } : { slot: "Off Hand" as const }),
      properties: [], // filled at runtime via armorProperties()/shieldProperties()
    };

    if (det.type === "Shield") shields.push(seed);
    else armor.push(seed);
  }
  return { armor, shields };
}

/** The reference's goods, unless skipped. */
function buildGoodsSeeds(ref: ItemReference): ItemDef[] {
  const goods: ItemDef[] = [];
  for (const [name, det] of Object.entries(ref.detected.goods)) {
    const item = correctedItem(ref, name, det);
    if (!item) continue;

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
  return goods;
}

/** The reference's weapons, by proficiency: those the generator has a definition of, unless skipped. */
function buildWeaponSeeds(
  ref: ItemReference,
): Pick<ItemSeedSets, "simpleWeapons" | "martialWeapons" | "exoticWeapons"> {
  const simpleWeapons: ItemDef[] = [];
  const martialWeapons: ItemDef[] = [];
  const exoticWeapons: ItemDef[] = [];
  for (const [srdName, det] of Object.entries(ref.detected.weapons)) {
    if (!det.generatorName) continue;
    const item = correctedItem(ref, srdName, det);
    if (!item) continue;
    const { costGp, weight } = item;
    // Find the raw entry for category info
    const rawWeapon = ref.raw.weapons.find((w) => w.name === srdName);
    const category = rawWeapon?.category?.replace(/ Weapons?$/, "").toLowerCase() ?? "";
    const description =
      item.description ?? `A ${category ? `${category} ` : ""}${det.proficiency.toLowerCase()} weapon.`;

    const seed: ItemDef = {
      name: det.generatorName,
      description,
      weight,
      costGp,
      type: "Weapon",
      properties: [], // filled at runtime via weaponProperties()
    };

    if (det.proficiency === "Simple") simpleWeapons.push(seed);
    else if (det.proficiency === "Martial") martialWeapons.push(seed);
    else exoticWeapons.push(seed);
  }
  return { simpleWeapons, martialWeapons, exoticWeapons };
}

/** An item's cost, weight and description (its override's, else as detected), unless it's skipped. */
function correctedItem(ref: ItemReference, srdName: string, det: { costGp: string; weight: string }) {
  const override = ref.overrides?.[srdName];
  if (override?.skip) return undefined;
  return {
    costGp: override?.costGp ?? det.costGp,
    weight: override?.weight ?? det.weight,
    description: override?.description,
  };
}

export function buildItemSeeds(ref: ItemReference): ItemSeedSets {
  return { ...buildWeaponSeeds(ref), ...buildArmorSeeds(ref), goods: buildGoodsSeeds(ref) };
}
