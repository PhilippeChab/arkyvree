import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A spell's fields' values. */
export type SpellFieldValues = FieldValues<typeof SPELL_FIELDS.fields>;

/**
 * A spell's fields, as the vocabulary declares them (`ENTITY_FIELDS.spells`). A spell without a school keeps none of
 * them its form shows.
 */
export const SPELL_FIELDS = new FieldCodec(ENTITY_FIELDS.spells, { storesWhen: (fields) => !!fields.school });
