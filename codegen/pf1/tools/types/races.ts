import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { LabeledText, Printing } from "./pages.ts";

/**
 * A race's page as read: its racial traits, not the other books' subraces and alternate traits. Its description and its
 * description's paragraphs (its physical description, its society…) aren't open game content, so its description is
 * written by hand (`RaceOverrides`).
 */
export interface RaceEntry {
  name: string;
  sources: Printing[];
  /** Its racial traits, each labelled: "+2 Constitution, +2 Wisdom, –2 Charisma", "Medium", "Slow and Steady"… */
  traits: LabeledText[];
}

/** A race's corrections made by hand: its description, in the parser's own words, and those the detection will read. */
export interface RaceOverrides {
  [correction: string]: unknown;
  /** What the race is and has, written for the app from its traits: its page's own description isn't open content. */
  description?: string;
}

/** A book's races. */
export interface RaceReference {
  _meta: ScrapedMeta<"race">;
  /** Corrections made by hand, by race. */
  overrides?: Overrides<RaceOverrides>;
  raw: RaceEntry[];
}
