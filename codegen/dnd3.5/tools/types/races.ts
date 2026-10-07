import type { Modifier, Property } from "@/content/dnd3.5/builders/customization/types.ts";

import type { DetectedModifiers, NamedText, Overrides, ScrapedMeta } from "./reference.ts";

export type RaceReference = {
  _meta: ScrapedMeta<"race">;

  detected: Record<string, DetectedModifiers>;

  /** Each race as the seeds make it: its overrides applied */
  mapping: Record<
    string,
    {
      baseSpeed: number;
      description?: string;
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
