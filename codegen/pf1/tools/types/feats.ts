import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { LabeledText, Printing } from "./pages.ts";

/**
 * A feat's page as read, its rules alone: its opening line isn't open game content, so a feat's description is its
 * Benefit, which its detection reads (`FeatDetector`).
 */
export interface FeatEntry {
  name: string;
  /** Its labelled sections, in its page's order: its Prerequisites, Benefit, Normal, Special… */
  sections: LabeledText[];
  sources: Printing[];
  /** Its types, as its title gives them: "Combat", "Teamwork"… none for a general feat. */
  types: string[];
}

/** A book's feats. */
export interface FeatReference {
  _meta: ScrapedMeta<"feat">;
  /** Corrections made by hand, by feat, which nothing reads yet. */
  overrides?: Overrides<unknown>;
  raw: FeatEntry[];
}
