import { dirname, join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { ITEM_FILES, ITEMS_INDEX } from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's magic items: its magic armor, shields and weapons, wondrous items, rings, rods and staffs. */
export function GeneratesMagicItems<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingMagicItems extends Base {
    /** A book's magic items' files, a file per kind. */
    writeMagicItems(ref: MagicItemReference, book: string) {
      const seeds = Library.book(book).magicItemSeeds(ref);
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
        `\nDone! Generated ${seeds.magicArmor.length} magic armor, ${seeds.magicShields.length} magic shields, ${seeds.magicWeapons.length} magic weapons`,
      );
      this.log(
        `  ${seeds.wondrousItems.length} wondrous items, ${seeds.rings.length} rings, ${seeds.rods.length} rods, ${seeds.staffs.length} staffs`,
      );
    }
  }
  return GeneratingMagicItems;
}
