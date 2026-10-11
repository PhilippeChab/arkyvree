import type { Modifier, Property } from "@/content/core/builders/customization/types.ts";

import type { DetectedModifiers, NamedText, Overrides, ScrapedMeta } from "./reference.ts";

export interface RaceReference {
  _meta: ScrapedMeta<"race">;

  /**
   * Each race's modifiers, and the languages its traits have it speak from the start (its automatic languages), by
   * name, or, when they name none, why (`unresolvedLanguages`).
   */
  detected: Record<string, DetectedModifiers & { languages?: string[]; unresolvedLanguages?: string[] }>;

  /** Each race as the seeds make it: its overrides applied */
  mapping: Record<
    string,
    {
      baseSpeed: number;
      description?: string;
      /** The languages it speaks from the start, by name: what its seed's modifiers grant */
      languages?: string[];
      modifiers?: Modifier[];
      name: string;
      properties?: Property[];
      size: string;
      skip?: boolean;
    }
  >;

  overrides?: Overrides<{
    baseSpeed?: number;
    description?: string;
    /**
     * The languages it speaks from the start, when its page names none or names them wrong (the human's: its page has
     * no traits).
     */
    languages?: string[];
    modifiers?: Modifier[];
    name?: string;
    /** Properties the engine reads off the race (the dwarf's speed in armor). */
    properties?: Property[];
    size?: string;
    skip?: boolean;
  }>;

  raw: {
    abilityAdjustments: { ability: string; value: number }[];
    baseSpeed: number;
    description: string;
    favoredClass?: string;
    features: NamedText[];
    name: string;
    size: string;
  }[];
}
