import type { Overrides, ScrapedMeta } from "./reference.ts";

export type ArmorRow = {
  name: string;
  category: string;
  cost: string;
  acBonus: string;
  maxDexBonus: string;
  armorCheckPenalty: string;
  arcaneSpellFailure: string;
  speed30: string;
  speed20: string;
  weight: string;
};

/** An item's fields an override sets. */
export type ItemFields = { description?: string; costGp?: string; weight?: string; skip?: boolean };

export type ItemReference = {
  _meta: Omit<ScrapedMeta<"item">, "sourceUrl"> & { sourceUrls: { weapons: string; armor: string; goods: string } };

  raw: {
    weapons: WeaponRow[];
    armor: ArmorRow[];
    goods: {
      name: string;
      tableId: string;
      cost: string;
      weight: string;
    }[];
  };

  detected: {
    weapons: Record<
      string,
      {
        generatorName: string | null;
        proficiency: string;
        costGp: string;
        weight: string;
      }
    >;
    armor: Record<
      string,
      {
        generatorName: string | null;
        type: "Armor" | "Shield";
        proficiencyCategory: string;
        costGp: string;
        weight: string;
      }
    >;
    goods: Record<
      string,
      {
        costGp: string;
        weight: string;
        category: string;
      }
    >;
    unresolved: string[];
  };

  overrides?: Overrides<ItemFields> & { nameMap?: Record<string, string> };
};

export type WeaponRow = {
  name: string;
  proficiency: string;
  category: string;
  cost: string;
  dmgSmall: string;
  dmgMedium: string;
  critical: string;
  rangeIncrement: string;
  weight: string;
  damageType: string;
};
