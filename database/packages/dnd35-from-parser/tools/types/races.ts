import type { Modifier, Property } from "@/database/packages/dnd35/content/customization/types.ts";

import type { DetectedModifiers, NamedText, Overrides, ScrapedMeta } from "./reference.ts";

export type RaceReference = {
  _meta: ScrapedMeta<"race">;

  detected: Record<string, DetectedModifiers>;

  mapping: Record<
    string,
    {
      description?: string;
      modifiers?: Modifier[];
    }
  >;

  overrides?: Overrides<{
    baseSpeed?: number;
    description?: string;
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
};
