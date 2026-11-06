import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { LabeledText, Printing } from "./pages.ts";

/** A mundane item's page as read. */
export interface ItemEntry {
  category: ItemCategory;
  description: string;
  /** Its statistics by label, as its page writes each: "Cost", "Weight", "Damage", "Critical", "Armor Bonus"… */
  fields: Record<string, string>;
  /**
   * The names its book lists its page under, each a variant of it the book prints ("Lock (average)", "Lock (good)"), its stat block pricing
   * each, other books' variants among them: its name alone for most.
   */
  listedAs: string[];
  name: string;
  /** Its page's other sections, each under its heading (an artifact's Destruction): none for most. */
  sections: LabeledText[];
  sources: Printing[];
}

/** A book's weapons, armor and goods. */
export interface ItemReference {
  _meta: ScrapedMeta<"item">;
  /** Corrections made by hand, by item: read by the detection to come. */
  overrides?: Overrides<unknown>;
  raw: ItemEntry[];
}

/** The kind of a mundane item, as its book lists it: a weapon, an armor or shield, or other goods. */
export type ItemCategory = "armor" | "goods" | "weapon";
