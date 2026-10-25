import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { PartialFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 item: an item (`ItemSeed`) with the fields 3.5 declares an item's. */
export type Dnd35ItemSeed = ItemSeed<ItemFields>;

/**
 * An item's fields a seed gives: some of those 3.5 declares an item's (`ENTITY_FIELDS.items`), a weapon's, an armor's
 * or a shield's some of its own, each of its kind.
 */
export type ItemFields = PartialFieldValues<typeof ENTITY_FIELDS.items>;
