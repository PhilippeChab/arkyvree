import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A power's fields' values. */
export type PowerFieldValues = FieldValues<typeof POWER_FIELDS.fields>;

/**
 * A power's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.powers`). A power that isn't a
 * spell (no school) keeps none of them.
 */
export const POWER_FIELDS = new FieldCodec(ENTITY_FIELDS.powers, { storesWhen: (fields) => !!fields.school });
