import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A race's fields' values. */
export type RaceFieldValues = FieldValues<typeof RACE_FIELDS.fields>;

/** A race's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.races`). */
export const RACE_FIELDS = new FieldCodec(ENTITY_FIELDS.races);
