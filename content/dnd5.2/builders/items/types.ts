import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

/** An item's single links: the template it's made from (`madeFrom`), by its name. */
export interface ItemLinks {
  madeFrom?: string;
}

/** A Pathfinder item: an item (`ItemSeed`) with the fields Pathfinder declares an item's, and the template it's made from. */
export type Dnd52ItemSeed = ItemSeed<ItemFields, ItemLinks>;

/**
 * An item's fields a seed gives, as stored: some of those Pathfinder declares an item's (`ENTITY_FIELDS.items`), by stored
 * field, each of its kind.
 */
export type ItemFields = StoredFieldValues<typeof ENTITY_FIELDS.items>;
