import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Cost, Ref } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * An item of the book's equipment as the database gives it: its categories (a weapon's "Martial Melee Weapons", an
 * armor's "Heavy Armor", "Adventuring Gear"…), cost and weight; a weapon's damage, properties, mastery and range; an
 * armor's class, Strength and Stealth; a tool's ability and uses; a pack's contents.
 */
export interface ItemEntry {
  ability?: Ref;
  ammunition?: Ref;
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  contents?: unknown[];
  cost: Cost;
  craft?: Ref[];
  damage?: { damage_dice: string; damage_type: Ref };
  description?: string;
  doff_time?: string;
  don_time?: string;
  equipment_categories: Ref[];
  index: string;
  mastery?: Ref;
  name: string;
  notes?: string[];
  properties?: Ref[];
  quantity?: number;
  range?: { long?: number; normal: number };
  stealth_disadvantage?: boolean;
  storage?: Record<string, unknown>;
  str_minimum?: number;
  throw_range?: { long: number; normal: number };
  two_handed_damage?: { damage_dice: string; damage_type: Ref };
  utilize?: unknown[];
  weight?: number;
}

/** The book's equipment: weapons, armor, adventuring gear, tools, mounts and vehicles. */
export interface ItemReference {
  _meta: ScrapedFrom<"item">;
  /**
   * Corrections made by hand, by item's name: its fields the SRD gives otherwise than the database, each in place of
   * the database's (a Trident's 2014 damage, Hide Armor's category, Half Plate Armor's name).
   */
  overrides?: Overrides<Partial<ItemEntry>>;
  raw: ItemEntry[];
}
