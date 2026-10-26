import type { Overrides, ScrapedMeta } from "./reference.ts";

/**
 * An item as the seeds make it: its cost in gold pieces and its weight in pounds, its override's or else as detected,
 * and its override's description.
 */
interface ItemMapping {
  costGp: number;
  description?: string;
  skip?: boolean;
  weight: number;
}

export interface ArmorRow {
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
}

/**
 * An item's fields an override sets.
 *
 * A good of the SRD's goods tables, as scraped: its name, cost and weight, and the table it's in.
 */
export interface GoodsRow {
  cost: string;
  name: string;
  tableId: string;
  weight: string;
}

export interface ItemFields {
  costGp?: number;
  description?: string;
  skip?: boolean;
  weight?: number;
}

export interface ItemReference {
  _meta: Omit<ScrapedMeta<"item">, "sourceUrl"> & { sourceUrls: { armor: string; goods: string; weapons: string } };

  detected: {
    armor: Record<
      string,
      {
        costGp: number;
        generatorName: string | null;
        proficiencyCategory: string;
        type: "Armor" | "Shield";
        weight: number;
      }
    >;
    goods: Record<
      string,
      {
        category: string;
        costGp: number;
        weight: number;
      }
    >;
    unresolved: string[];
    weapons: Record<
      string,
      {
        costGp: number;
        generatorName: string | null;
        proficiency: string;
        weight: number;
      }
    >;
  };

  /** Each weapon, armor, shield and good as the seeds make it: its overrides applied */
  mapping: {
    armor: Record<string, ItemMapping>;
    goods: Record<string, ItemMapping>;
    weapons: Record<string, ItemMapping>;
  };

  overrides?: Overrides<ItemFields> & { nameMap?: Record<string, string> };

  raw: {
    armor: ArmorRow[];
    goods: GoodsRow[];
    weapons: WeaponRow[];
  };
}

export interface WeaponRow {
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
}
