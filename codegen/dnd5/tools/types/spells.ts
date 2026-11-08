import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Ref } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * A spell as the database gives it: its level (0, a cantrip) and school, the classes whose lists hold it, its casting
 * time, range, components and duration, whether it's a ritual or takes concentration, its attack or damage, its text
 * and what a higher slot adds.
 */
export interface SpellEntry {
  attack_type?: string;
  casting_time: string;
  classes: Ref[];
  components: string[];
  concentration: boolean;
  damage?: Record<string, unknown>;
  description: string;
  duration: string;
  higher_level?: string;
  index: string;
  level: number;
  material?: string;
  name: string;
  range: string;
  ritual: boolean;
  school: Ref;
}

/** The book's spells. */
export interface SpellReference {
  _meta: ScrapedFrom<"spell">;
  /** Corrections made by hand, by entry's name: its fields the SRD gives otherwise than the database, each in place of the database's. */
  overrides?: Overrides<Partial<SpellEntry>>;
  raw: SpellEntry[];
}
