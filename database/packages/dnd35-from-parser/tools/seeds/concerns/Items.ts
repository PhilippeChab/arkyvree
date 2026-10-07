import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import type { ItemSeedSets } from "@/database/packages/dnd35-from-parser/tools/seeds/items.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's weapons, armor, shields and goods. */
export function Items<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithItems extends Base {
    /** The seeds of an item reference of the book, by kind. */
    itemSeeds(ref: ItemReference): ItemSeedSets {
      return this.itemsOf(ref);
    }
  }
  return WithItems;
}
