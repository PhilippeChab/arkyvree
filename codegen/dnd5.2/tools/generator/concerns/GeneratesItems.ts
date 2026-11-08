import { dirname, join } from "node:path";

import { type BaseBookGenerator } from "@/codegen/dnd5.2/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd5.2/tools/generator/BookLayout.ts";
import type { ItemSeeds } from "@/codegen/dnd5.2/tools/seeds/ItemSeeds.ts";
import type { MagicItemSeeds } from "@/codegen/dnd5.2/tools/seeds/MagicItemSeeds.ts";
import type { Dnd52ItemSeed } from "@/content/dnd5.2/builders/items/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A book's item seeds, by the kind each of its item files holds. */
type ItemSeedsByKind = Partial<Record<(typeof BookLayout.itemFiles)[number]["seeds"], Dnd52ItemSeed[]>>;

/**
 * Generating a book's items, a file per kind: its mundane items' (weapons, armor, the Shield, gear and tools) and its
 * magic items' (magic weapons, ammunition, armor and shields, potions, rings, rods, scrolls, staffs, wands and
 * wondrous items). A kind of none has no file.
 */
export function GeneratesItems<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingItems extends Base {
    /** The book's item files of each kind `seeds` holds any of. */
    protected writeItemFiles(seeds: ItemSeedsByKind) {
      for (const { path, list, seeds: kind } of BookLayout.itemFiles) {
        const items = seeds[kind];
        if (items && items.length > 0) {
          this.writeList(join(dirname(BookLayout.itemsIndex), path), list, "Dnd52ItemSeed", items, (file, item) =>
            file.item(item),
          );
        }
      }
    }

    /** The book's mundane items' files, a file per kind. Its items are returned. */
    writeItems(items: ItemSeeds): Dnd52ItemSeed[] {
      const seeds = items.seeds();
      this.writeItemFiles({ ...seeds });
      const counts = Object.entries(seeds).map(([kind, list]) => `${list.length} ${kind}`);
      this.log(`Built ${counts.join(", ")}`);
      return Object.values(seeds).flat();
    }

    /** The book's magic items' files, a file per kind: the families made of their variants logged. Its items are returned. */
    writeMagicItems(magicItems: MagicItemSeeds): Dnd52ItemSeed[] {
      const seeds = magicItems.seeds();
      this.writeItemFiles({ ...seeds });
      const counts = Object.entries(seeds).map(([kind, list]) => `${list.length} ${kind}`);
      this.log(`Built ${counts.join(", ")}`);
      this.log(`  Their variants in place of: ${magicItems.leftOut().join(", ")}`);
      return Object.values(seeds).flat();
    }
  }
  return GeneratingItems;
}
