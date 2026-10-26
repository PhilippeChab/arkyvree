import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** An item's single links: the template it's made from (`madeFrom`), by its name. */
export interface ItemLinks {
  madeFrom?: string;
}

/** A 3.5 item: an item (`ItemSeed`) with the fields 3.5 declares an item's, and the template it's made from. */
export type Dnd35ItemSeed = ItemSeed<ItemFields, ItemLinks>;

/**
 * An item's fields a seed gives, as stored: some of those 3.5 declares an item's (`ENTITY_FIELDS.items`), by stored
 * field, each of its kind.
 */
export type ItemFields = StoredFieldValues<typeof ENTITY_FIELDS.items>;
