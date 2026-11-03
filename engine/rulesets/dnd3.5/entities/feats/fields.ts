import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A feat's fields' values. */
export type FeatFieldValues = FieldValues<typeof FEAT_FIELDS.fields>;

/** A feat's fields, as the vocabulary declares them (`ENTITY_FIELDS.feats`). */
export const FEAT_FIELDS = new FieldCodec(ENTITY_FIELDS.feats);
