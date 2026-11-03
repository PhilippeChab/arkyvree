import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import type { LinkedEntity } from "./entityFields.ts";

/**
 * What an input that reads the entity takes (a list of links', a template's): its description, where its value goes
 * (`name`), its form, the entity type it edits, and what it reads.
 */
export interface EntityInputProps<T extends FieldValues, F> {
  context: FieldContext;
  /** The entity type the form edits, whose templates a template offers (an item's, other items) */
  entityType: string;
  field: F;
  form: UseFormReturn<T>;
  help: boolean;
  name: FieldPath<T>;
  rulesetId: string;
}

/**
 * What a form's fields read past their description, of the entity it edits: the entities it links to and grants (so
 * they show by name), whether it's new (a new spell needs a pool), the template it was saved with, the fields it keeps
 * as they are, and what a field's change does besides.
 */
export interface FieldContext {
  /** Labels of the entities it grants that a search may not list (an inherited level's feats), by `grantKey` */
  grantLabels?: ReadonlyMap<string, string>;
  /** The entities its links may already name (the entity's own: a feat's pools), so they show by name */
  knownLinks?: LinkedEntity[];
  /** The fields it keeps as they are (a duplicate's type, slot and template, copied from its source) */
  locked?: readonly string[];
  /** A new entity's form (a create dialog's), which sends every field and needs what a new one needs */
  newEntity?: boolean;
  /** The name of the template the entity was saved with, which its select shows while it isn't one of its type */
  templateName?: string | null;
}
