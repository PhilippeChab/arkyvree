import { dirname, join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { ITEM_FILES, ITEMS_INDEX } from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's mundane items: its weapons, armor, shields and goods. */
export function GeneratesItems<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingItems extends Base {
    /** A book's mundane items' files, a file per kind. */
    writeItems(ref: ItemReference, book: string) {
      const seeds = Library.book(book).itemSeeds(ref);
      for (const { path, list, seeds: kind } of ITEM_FILES) {
        if (!(kind in seeds)) continue;
        this.writeList(
          join(this.dir, book, dirname(ITEMS_INDEX), path),
          list,
          "ItemSeed",
          seeds[kind as keyof typeof seeds],
          (file, item) => file.item(item),
        );
      }

      this.log(
        `\nDone! Generated ${seeds.simpleWeapons.length} simple, ${seeds.martialWeapons.length} martial, ${seeds.exoticWeapons.length} exotic weapons`,
      );
      this.log(`  ${seeds.armor.length} armor, ${seeds.shields.length} shields, ${seeds.goods.length} goods`);
    }
  }
  return GeneratingItems;
}
