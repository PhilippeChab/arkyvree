import type { Modifier, Property, RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import type { ItemLocation } from "@/shared/enums.ts";

/** An item: a template others are made from, or one made from a template (`sourceItem`). */
export type ItemSeed = {
  costGp: string;
  description: string;
  /** A template among magic items, which others are made from (elven chain): seeded with the mundane templates. */
  isTemplate?: true;
  modifiers?: Modifier[];
  name: string;
  properties: Property[];
  requirements?: RequirementEntry[];
  slot?: ItemLocation;
  /** The template item this one is made from, by name. */
  sourceItem?: string;
  type: string;
  weight: string;
};
