import type { Modifier, RequirementEntry } from "@/content/core/builders/customization/types.ts";

/**
 * An item: its name and description, its fields as stored, by the stored field that keeps each (`F`, its ruleset's),
 * its single links by role, each naming an item by its name (`L`, its ruleset's: the template it's made from), and its
 * customizations.
 */
export interface ItemSeed<F extends SeededFields = SeededFields, L extends object = object> {
  description: string;
  fields: F;
  links?: L;
  modifiers?: Modifier[];
  name: string;
  requirements?: RequirementEntry[];
}

/** A seed's fields as stored, by stored field: each a value of its kind, a flag, a number or a text, or a list's. */
export type SeededFields = Readonly<Record<string, boolean | number | string | readonly string[]>>;
