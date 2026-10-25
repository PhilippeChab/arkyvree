import type { Modifier, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { ItemLocation } from "@/shared/enums.ts";

/**
 * An item: a template others are made from, or one made from a template (`sourceItem`), with the fields its ruleset
 * declares an item's (`F`, those it gives).
 */
export interface ItemSeed<F extends object> {
  costGp: string;
  description: string;
  fields?: F;
  /** A template among magic items, which others are made from (elven chain): seeded with the mundane templates. */
  isTemplate?: true;
  modifiers?: Modifier[];
  name: string;
  requirements?: RequirementEntry[];
  slot?: ItemLocation;
  /** The template item this one is made from, by name. */
  sourceItem?: string;
  type: string;
  weight: string;
}
