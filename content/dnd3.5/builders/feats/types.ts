import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { PartialFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A feat: the aptitudes it's taken in, what it takes, and what it gives. */
export interface FeatSeed {
  aptitudes: string[];
  description: string;
  fields?: FeatFields;
  /** One of a family's feats, made for each of its options (`Weapon Focus: Longsword`): its name names it */
  generated?: boolean;
  modifiers?: ModifierSeed[];
  name: string;
  requirements?: RequirementEntry[];
  selectable?: boolean;
  stackable?: boolean;
}

/** A feat's fields a seed gives: some of those 3.5 declares a feat's (`ENTITY_FIELDS.feats`), each of its kind. */
export type FeatFields = PartialFieldValues<typeof ENTITY_FIELDS.feats>;
