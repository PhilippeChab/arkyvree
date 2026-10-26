import type { Modifier, RequirementEntry } from "@/content/core/builders/customization/types.ts";

/**
 * An item: a template others are made from, or one made from a template (`sourceItem`), with the fields its ruleset
 * declares an item's (`F`, those it gives), and its slot, one of its ruleset's locations (`L`).
 */
export interface ItemSeed<F extends object, L extends string = string> {
  costGp: string;
  description: string;
  fields?: F;
  /** A template among magic items, which others are made from (elven chain): seeded with the mundane templates. */
  isTemplate?: true;
  modifiers?: Modifier[];
  name: string;
  requirements?: RequirementEntry[];
  slot?: L;
  /** The template item this one is made from, by name. */
  sourceItem?: string;
  type: string;
  weight: string;
}
