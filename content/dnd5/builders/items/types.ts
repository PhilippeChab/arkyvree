import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5/fields/index.ts";

/** An item's single links: the template it's made from (`madeFrom`), by its name. */
export interface ItemLinks {
  madeFrom?: string;
}

/** A D&D 5th Edition item: an item (`ItemSeed`) with its rules' item fields, and the template it's made from. */
export type Dnd5ItemSeed = ItemSeed<ItemFields, ItemLinks>;

/**
 * An item's fields a seed gives, as stored: some of its rules' (`ENTITY_FIELDS.items`), by stored
 * field, each of its kind.
 */
export type ItemFields = StoredFieldValues<typeof ENTITY_FIELDS.items>;
