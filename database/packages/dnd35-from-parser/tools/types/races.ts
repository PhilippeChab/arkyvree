import type { Modifier, Property } from "@/database/packages/dnd35/content/customization/types.ts";

import type { DetectedModifiers, NamedText, Overrides, ScrapedMeta } from "./reference.ts";

export type RaceReference = {
  _meta: ScrapedMeta<"race">;

  raw: {
    name: string;
    description: string;
    size: string;
    baseSpeed: number;
    abilityAdjustments: { ability: string; value: number }[];
    favoredClass?: string;
    features: NamedText[];
  }[];

  detected: Record<string, DetectedModifiers>;

  overrides?: Overrides<{
    name?: string;
    description?: string;
    size?: string;
    baseSpeed?: number;
    modifiers?: Modifier[];
    /** Properties the engine reads off the race (the dwarf's speed in armor). */
    properties?: Property[];
    skip?: boolean;
  }>;

  mapping: Record<
    string,
    {
      description?: string;
      modifiers?: Modifier[];
    }
  >;
};
