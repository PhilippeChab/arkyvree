import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

/** A background's fields' values. */
export type BackgroundFieldValues = FieldValues<typeof BACKGROUND_FIELDS.fields>;

/** A background's fields, as the vocabulary declares them (`ENTITY_FIELDS.backgrounds`): none. */
export const BACKGROUND_FIELDS = new FieldCodec(ENTITY_FIELDS.backgrounds);
