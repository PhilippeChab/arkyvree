import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { LabeledText, Printing } from "./pages.ts";

/** A magic item's page as read. */
export interface MagicItemEntry {
  category: MagicItemCategory;
  /** Its construction by label: "Requirements", "Cost". None for an item made otherwise (an artifact, a cursed item). */
  construction: Record<string, string>;
  description: string;
  /** Its stat block by label, as its page writes each: "Aura", "CL", "Slot", "Price", "Weight". */
  fields: Record<string, string>;
  /**
   * The names its book lists its page under, each a variant of it the book prints ("Cloak of Resistance (+1)", "(+2)"…), its stat block pricing
   * each, other books' variants among them: its name alone for most.
   */
  listedAs: string[];
  name: string;
  /** Its page's other sections, each under its heading (an artifact's Destruction): none for most. */
  sections: LabeledText[];
  sources: Printing[];
}

/** A book's magic items. */
export interface MagicItemReference {
  _meta: ScrapedMeta<"magicItem">;
  /** Corrections made by hand, by item: read by the detection to come. */
  overrides?: Overrides<unknown>;
  raw: MagicItemEntry[];
}

/** The kind of a magic item, as its book lists it. */
export type MagicItemCategory = "armor" | "artifact" | "cursed" | "ring" | "rod" | "staff" | "weapon" | "wondrous";
