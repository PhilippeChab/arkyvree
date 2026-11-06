import { dirname, join } from "node:path";

import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import type { ItemReference } from "@/codegen/pf1/tools/types/items.ts";
import type { MagicItemReference } from "@/codegen/pf1/tools/types/magicItems.ts";
import type { Pf1ItemSeed } from "@/content/pf1/builders/items/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A book's item seeds, by the kind each of its item files holds. */
type ItemSeedsByKind = Partial<Record<(typeof BookLayout.itemFiles)[number]["seeds"], Pf1ItemSeed[]>>;

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
          this.writeList(join(dirname(BookLayout.itemsIndex), path), list, "Pf1ItemSeed", items, (file, item) =>
            file.item(item),
          );
        }
      }
    }

    /** The book's mundane items' files, a file per kind: what its tables list that's no item logged. */
    writeItems(ref: ItemReference) {
      const items = this.seeds.items(ref);
      const seeds = items.seeds();
      this.writeItemFiles(seeds);
      this.log(
        `Built ${seeds.simpleWeapons.length} simple, ${seeds.martialWeapons.length} martial, ${seeds.exoticWeapons.length} exotic weapons, ${seeds.armor.length} armor, ${seeds.shields.length} shields, ${seeds.goods.length} goods`,
      );
      this.log(`  Left out: ${items.leftOut().join("; ")}`);
    }

    /** The book's magic items' files, a file per kind: what it leaves out logged. */
    writeMagicItems(ref: MagicItemReference) {
      const magicItems = this.seeds.magicItems(ref);
      const seeds = magicItems.seeds();
      this.writeItemFiles(seeds);
      this.log(
        `Built ${seeds.magicArmor.length} magic armor, ${seeds.magicShields.length} magic shields, ${seeds.magicWeapons.length} magic weapons, ${seeds.wondrousItems.length} wondrous items, ${seeds.rings.length} rings, ${seeds.rods.length} rods, ${seeds.staffs.length} staffs`,
      );
      this.log(`  Left out ${magicItems.leftOut().length} magic items (artifacts, cursed items, special abilities)`);
      const unbased = magicItems.unbased();
      if (unbased.length > 0) this.log(`  Made from no base item: ${unbased.join("; ")}`);
    }
  }
  return GeneratingItems;
}
