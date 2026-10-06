import type {
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";

/** A feat: the aptitudes it's taken in, what it takes, and what it gives. */
export type FeatSeed = {
  name: string;
  description: string;
  stackable?: boolean;
  selectable?: boolean;
  /** One of a family's feats, made for each of its options (`Weapon Focus: Longsword`): its name names it */
  generated?: boolean;
  aptitudes: string[];
  modifiers?: ModifierSeed[];
  requirements?: RequirementEntry[];
  properties?: Property[];
};
