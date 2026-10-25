import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** An item's fields' values. */
export type ItemFieldValues = FieldValues<typeof ITEM_FIELDS.fields>;

/** A weapon's fields: what its attacks, its groupings and the hands it's held in read. */
export type WeaponFields = ItemFieldValues["weapon"];

/**
 * An item's fields its stored values hold, as the vocabulary declares them (`ENTITY_FIELDS.items`). An item made from
 * a template holds only the fields it overrides, read off its own values merged with its template's, and what the
 * engine does without a field's value (a critical of 1, Strength to damage by the hand) stays where the engine reads it.
 */
export const ITEM_FIELDS = new FieldCodec(ENTITY_FIELDS.items);
