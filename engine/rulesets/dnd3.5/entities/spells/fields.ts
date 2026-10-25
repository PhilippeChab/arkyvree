import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A spell's fields' values. */
export type SpellFieldValues = FieldValues<typeof SPELL_FIELDS.fields>;

/**
 * A spell's fields its stored values hold, as the vocabulary declares them (`ENTITY_FIELDS.spells`). A spell without
 * a school keeps none of them.
 */
export const SPELL_FIELDS = new FieldCodec(ENTITY_FIELDS.spells, { storesWhen: (fields) => !!fields.school });
