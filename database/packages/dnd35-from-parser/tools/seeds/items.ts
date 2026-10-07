/** An item reference's seeds: its ItemSeed[], by category. */

import { type ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { ItemSeed } from "@/database/packages/dnd35/content/items/types.ts";

export type ItemSeedSets = {
  simpleWeapons: ItemSeed[];
  martialWeapons: ItemSeed[];
  exoticWeapons: ItemSeed[];
  armor: ItemSeed[];
  shields: ItemSeed[];
  goods: ItemSeed[];
};

export function buildItemSeeds(ref: ItemReference): ItemSeedSets {
  const simpleWeapons: ItemSeed[] = [];
  const martialWeapons: ItemSeed[] = [];
  const exoticWeapons: ItemSeed[] = [];
  const armor: ItemSeed[] = [];
  const shields: ItemSeed[] = [];
  const goods: ItemSeed[] = [];

  /** An item's cost, weight and description (its override's, else as detected), unless it's skipped. */
  const corrected = (srdName: string, det: { costGp: string; weight: string }) => {
    const override = ref.overrides?.[srdName];
    if (override?.skip) return undefined;
    return {
      costGp: override?.costGp ?? det.costGp,
      weight: override?.weight ?? det.weight,
      description: override?.description,
    };
  };

  // Build weapons
  for (const [srdName, det] of Object.entries(ref.detected.weapons)) {
    if (!det.generatorName) continue;
    const item = corrected(srdName, det);
    if (!item) continue;
    const { costGp, weight } = item;
    // Find the raw entry for category info
    const rawWeapon = ref.raw.weapons.find((w) => w.name === srdName);
    const category = rawWeapon?.category?.replace(/ Weapons?$/, "").toLowerCase() ?? "";
    const description =
      item.description ?? `A ${category ? `${category} ` : ""}${det.proficiency.toLowerCase()} weapon.`;

    const seed: ItemSeed = {
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

  // Build armor & shields
  for (const [srdName, det] of Object.entries(ref.detected.armor)) {
    if (!det.generatorName) continue;
    const item = corrected(srdName, det);
    if (!item) continue;
    const { costGp, weight } = item;
    const categoryLabel = det.proficiencyCategory.replace(/ armor$/i, "");
    const description = item.description ?? `${det.type === "Shield" ? "A shield" : `${categoryLabel} armor`}.`;

    const seed: ItemSeed = {
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

  // Build goods
  for (const [name, det] of Object.entries(ref.detected.goods)) {
    const item = corrected(name, det);
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

  return { simpleWeapons, martialWeapons, exoticWeapons, armor, shields, goods };
}
