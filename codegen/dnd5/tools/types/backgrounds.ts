import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Choice, Ref } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * A background as the database gives it: the three abilities its increases go to, the origin feat it grants (with
 * the choice it's taken for: Magic Initiate's spell list), its skill and tool proficiencies, and its equipment.
 */
export interface BackgroundEntry {
  ability_scores: Ref[];
  equipment_options: unknown[];
  feat: Ref & { note?: string };
  index: string;
  name: string;
  proficiencies: Ref[];
  proficiency_choices?: Choice[];
}

/** The book's backgrounds. */
export interface BackgroundReference {
  _meta: ScrapedFrom<"background">;
  /** Corrections made by hand, by entry's name: its fields the SRD gives otherwise than the database (the Sage's Magic Initiate, the Wizard's). */
  overrides?: Overrides<Partial<BackgroundEntry>>;
  raw: BackgroundEntry[];
}
