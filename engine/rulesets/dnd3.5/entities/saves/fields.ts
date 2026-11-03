import { FieldCodec } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A save's fields, as the vocabulary declares them (`ENTITY_FIELDS.saves`): the ability its bonus comes from. */
export const SAVE_FIELDS = new FieldCodec(ENTITY_FIELDS.saves);
