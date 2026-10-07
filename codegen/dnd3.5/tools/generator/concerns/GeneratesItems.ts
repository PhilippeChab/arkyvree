import { dirname, join } from "node:path";

import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import type { ItemReference } from "@/codegen/dnd3.5/tools/types/items.ts";
import type { MagicItemReference } from "@/codegen/dnd3.5/tools/types/magicItems.ts";
import type { ItemSeed } from "@/content/dnd3.5/builders/items/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A book's item seeds, by the kind each of its item files holds. */
type ItemSeedsByKind = Partial<Record<(typeof BookLayout.itemFiles)[number]["seeds"], ItemSeed[]>>;

/**
 * Generating a book's items, a file per kind: its mundane items' (weapons, armor, shields and goods) and its magic
 * items' (magic armor, shields and weapons, wondrous items, rings, rods and staffs).
 */
export function GeneratesItems<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingItems extends Base {
    /** The book's item files of each kind `seeds` holds. */
    protected writeItemFiles(seeds: ItemSeedsByKind) {
      for (const { path, list, seeds: kind } of BookLayout.itemFiles) {
        const items = seeds[kind];
        if (items) {
          this.writeList(join(dirname(BookLayout.itemsIndex), path), list, "ItemSeed", items, (file, item) =>
            file.item(item),
          );
        }
      }
    }

    /** The book's mundane items' files, a file per kind. */
    writeItems(ref: ItemReference) {
      const seeds = this.seeds.items(ref).seeds();
      this.writeItemFiles(seeds);
      this.log(
        `\nDone! Generated ${seeds.simpleWeapons.length} simple, ${seeds.martialWeapons.length} martial, ${seeds.exoticWeapons.length} exotic weapons`,
      );
      this.log(`  ${seeds.armor.length} armor, ${seeds.shields.length} shields, ${seeds.goods.length} goods`);
    }

    /** The book's magic items' files, a file per kind. */
    writeMagicItems(ref: MagicItemReference) {
      const seeds = this.seeds.magicItems(ref).seeds();
      this.writeItemFiles(seeds);
      this.log(
        `\nDone! Generated ${seeds.magicArmor.length} magic armor, ${seeds.magicShields.length} magic shields, ${seeds.magicWeapons.length} magic weapons`,
      );
      this.log(
        `  ${seeds.wondrousItems.length} wondrous items, ${seeds.rings.length} rings, ${seeds.rods.length} rods, ${seeds.staffs.length} staffs`,
      );
    }
  }
  return GeneratingItems;
}
