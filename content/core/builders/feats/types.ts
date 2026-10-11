import type { ModifierSeed, Property, RequirementEntry } from "@/content/core/builders/customization/types.ts";

/** A feat: the aptitudes it's taken in, what it takes, and what it gives. */
export interface FeatSeed {
  aptitudes: string[];
  description: string;
  /** One of a family's feats, made for each of its options (`Weapon Focus: Longsword`): its name names it */
  generated?: boolean;
  modifiers?: ModifierSeed[];
  name: string;
  properties?: Property[];
  requirements?: RequirementEntry[];
  selectable?: boolean;
  stackable?: boolean;
}
