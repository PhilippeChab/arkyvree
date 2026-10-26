import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A feat: the aptitudes it's taken in, what it takes, and what it gives; and its fields as stored (whether it stacks,
 * whether a level up picks it, whether its ruleset made it: one of a family's, made for each of its options, `Weapon
 * Focus: Longsword`), each its default without one.
 */
export interface FeatSeed {
  aptitudes: string[];
  description: string;
  fields?: FeatFields;
  modifiers?: ModifierSeed[];
  name: string;
  requirements?: RequirementEntry[];
}

/**
 * A feat's fields a seed gives, as stored: some of those 3.5 declares a feat's (`ENTITY_FIELDS.feats`), by stored
 * field, each of its kind.
 */
export type FeatFields = StoredFieldValues<typeof ENTITY_FIELDS.feats>;
