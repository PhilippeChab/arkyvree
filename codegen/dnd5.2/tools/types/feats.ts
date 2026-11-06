import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Choice } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * A feat as the database gives it: its category (`origin`, `general`, `fighting-style`, `epic-boon`), its
 * prerequisites (a level, an ability score, a feature), whether it repeats, and its text.
 */
export interface FeatEntry {
  description: string;
  index: string;
  name: string;
  prerequisite_options?: Choice;
  prerequisites?: Record<string, unknown>;
  /** What taking it again does ("You can take this feat more than once…"), for a feat that repeats. */
  repeatable?: string;
  type: string;
}

/** The book's feats. */
export interface FeatReference {
  _meta: ScrapedFrom<"feat">;
  /** Corrections made by hand, by feat: read by the detection to come. */
  overrides?: Overrides<unknown>;
  raw: FeatEntry[];
}
