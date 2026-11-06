import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Ref } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * A magic item as the database gives it: its category (Armor, Potion, Ring, Wondrous Item…), its rarity, whether it
 * takes attunement and by whom (`limited-to`), its text, and its variants (a Weapon, +1, +2 or +3).
 */
export interface MagicItemEntry {
  attunement: boolean;
  desc: string[];
  equipment_category: Ref;
  index: string;
  "limited-to"?: string;
  name: string;
  rarity: { name: string };
  variant: boolean;
  variants: Ref[];
}

/** The book's magic items. */
export interface MagicItemReference {
  _meta: ScrapedFrom<"magicItem">;
  /** Corrections made by hand, by item: read by the detection to come. */
  overrides?: Overrides<unknown>;
  raw: MagicItemEntry[];
}
