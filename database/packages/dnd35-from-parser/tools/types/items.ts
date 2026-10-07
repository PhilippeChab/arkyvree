import type { Overrides, ScrapedMeta } from "./reference.ts";

export type ArmorRow = {
  acBonus: string;
  arcaneSpellFailure: string;
  armorCheckPenalty: string;
  category: string;
  cost: string;
  maxDexBonus: string;
  name: string;
  speed20: string;
  speed30: string;
  weight: string;
};

/** An item's fields an override sets. */
export type ItemFields = { costGp?: string; description?: string; skip?: boolean; weight?: string };

export type ItemReference = {
  _meta: Omit<ScrapedMeta<"item">, "sourceUrl"> & { sourceUrls: { armor: string; goods: string; weapons: string } };

  detected: {
    armor: Record<
      string,
      {
        costGp: string;
        generatorName: string | null;
        proficiencyCategory: string;
        type: "Armor" | "Shield";
        weight: string;
      }
    >;
    goods: Record<
      string,
      {
        category: string;
        costGp: string;
        weight: string;
      }
    >;
    unresolved: string[];
    weapons: Record<
      string,
      {
        costGp: string;
        generatorName: string | null;
        proficiency: string;
        weight: string;
      }
    >;
  };

  overrides?: Overrides<ItemFields> & { nameMap?: Record<string, string> };

  raw: {
    armor: ArmorRow[];
    goods: {
      cost: string;
      name: string;
      tableId: string;
      weight: string;
    }[];
    weapons: WeaponRow[];
  };
};

export type WeaponRow = {
  category: string;
  cost: string;
  critical: string;
  damageType: string;
  dmgMedium: string;
  dmgSmall: string;
  name: string;
  proficiency: string;
  rangeIncrement: string;
  weight: string;
};
