import type { ScrapedMeta } from "@/codegen/core/references/types.ts";

import type { LabeledText, PageTable, Printing } from "./pages.ts";

/**
 * A class's page as read, its rules alone: its details, its requirements, its skills, its tables and features. Its
 * description and its role aren't open game content, so its description is written by hand (`ClassOverrides`).
 */
export interface ClassEntry {
  /** Its class skills' sentence: "The Fighter's class skills are Climb (Str), Craft (Int)…". */
  classSkills: string;
  /** Its labelled details: a base class's alignment, its hit die, its starting wealth, its skill points at each level… */
  details: LabeledText[];
  /** What its "Ex-" section says of a member who breaks its code (an ex-cleric, an ex-monk): none for most. */
  exClass?: string;
  /** Its class features, each its name (with its kind: "Bravery (Ex)") and its text, in its page's order. */
  features: LabeledText[];
  name: string;
  /** Whether it's a prestige class, which a character takes once it meets its requirements. */
  prestige: boolean;
  /** A prestige class's requirements, each labelled ("Base Attack Bonus": "+6."): none for a base class. */
  requirements: LabeledText[];
  sources: Printing[];
  /** Its tables: its progression (its levels' base attack bonus, saves, specials, spells per day), its spells known… */
  tables: PageTable[];
}

/** A class's corrections made by hand: its description, in the parser's own words, and those the detection will read. */
export interface ClassOverrides {
  [correction: string]: unknown;
  /** What the class is and does, written for the app from its rules: its page's own description isn't open content. */
  description?: string;
  /** Its name, where its book's carries a trademark, which is product identity ("Pathfinder Chronicler": "Chronicler"). */
  name?: string;
  reviewed?: string[];
}

/** A class's reference: its page, as read, in a file of its own. */
export interface ClassReference {
  _meta: ScrapedMeta<"class">;
  overrides?: ClassOverrides;
  raw: ClassEntry;
}
