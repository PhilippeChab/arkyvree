import { type BaseBookSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/BaseBookSeeds.ts";
import {
  buildMagicItemSeeds,
  type MagicItemSeedSets,
} from "@/database/packages/dnd35-from-parser/tools/seeds/magicItems.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A book's magic items: its magic armor, shields and weapons, wondrous items, rings, rods and staffs. */
export function MagicItems<B extends Constructor<BaseBookSeeds>>(Base: B) {
  abstract class WithMagicItems extends Base {
    /**
     * The seeds of a magic item reference of the book, by kind, an item made from a base one weighing what the book's
     * base item does (`baseItemWeights`).
     */
    magicItemSeeds(ref: MagicItemReference): MagicItemSeedSets {
      return this.memoOf(ref, "magicItems", () => buildMagicItemSeeds(ref, this.baseItemWeights()));
    }
  }
  return WithMagicItems;
}
