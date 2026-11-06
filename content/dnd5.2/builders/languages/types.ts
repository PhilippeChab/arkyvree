import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

/** A language: its name, who speaks it, and its fields as stored (its type: Spoken, Secret). */
export interface LanguageSeed {
  description: string;
  fields: StoredFieldValues<typeof ENTITY_FIELDS.languages>;
  name: string;
}
