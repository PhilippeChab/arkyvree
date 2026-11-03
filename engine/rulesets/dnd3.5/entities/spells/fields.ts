import { FieldCodec } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A spell's fields, as the vocabulary declares them (`ENTITY_FIELDS.spells`). A spell without a school keeps none of
 * them its form shows (its school's `keepsForm`).
 */
export const SPELL_FIELDS = new FieldCodec(ENTITY_FIELDS.spells);
