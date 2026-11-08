import type { Modifier } from "@/content/core/builders/customization/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5/fields/index.ts";

/**
 * A species as its seed gives it: its name, description and fields (its size and speed), its traits as modifiers
 * (darkvision's senses aside, the feats it grants and the picks it gives), what it's for (`partition`), and the species
 * it's a kind of (`subspeciesOf`, by name: an elf's lineage).
 */
export interface SpeciesSeed {
  description: string;
  fields: SpeciesFields;
  links?: { subspeciesOf?: string };
  modifiers?: Modifier[];
  name: string;
  partition?: string;
}

export type SpeciesFields = StoredFieldValues<typeof ENTITY_FIELDS.species>;
