import { FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/** An item's fields' values. */
export type ItemFieldValues = FieldValues<typeof ITEM_FIELDS.fields>;

/** A weapon's fields: what its attacks, its groupings and the hands it's held in read. */
export type WeaponFields = ItemFieldValues["weapon"];

/**
 * An item's fields its properties hold, as the vocabulary declares them (`ENTITY_FIELDS.items`): a weapon's, an
 * armor's and a shield's, and what any item has, each none (or empty) without its row, so an item made from a template
 * holds only the fields it overrides. Read off the item's own rows merged with its template's.
 */
export const ITEM_FIELDS = new FieldCodec(ENTITY_FIELDS.items);
