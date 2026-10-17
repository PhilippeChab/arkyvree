import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A feat's fields' values. */
export type FeatFieldValues = FieldValues<typeof FEAT_FIELDS.fields>;

/**
 * A feat's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.feats`): the families it's in,
 * the weapon rules it changes, and the schools it forbids. Read off several feats' rows at once, they're all of theirs.
 */
export const FEAT_FIELDS = new FieldCodec(ENTITY_FIELDS.feats);
