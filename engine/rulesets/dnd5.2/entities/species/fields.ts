import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

/** A species' fields' values. */
export type SpeciesFieldValues = FieldValues<typeof SPECIES_FIELDS.fields>;

/** A species' fields, as the vocabulary declares them (`ENTITY_FIELDS.species`). */
export const SPECIES_FIELDS = new FieldCodec(ENTITY_FIELDS.species);
