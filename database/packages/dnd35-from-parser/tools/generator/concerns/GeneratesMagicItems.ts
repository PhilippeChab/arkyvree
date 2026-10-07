import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { MagicItemSeedSets } from "@/database/packages/dnd35-from-parser/tools/seeds/magicItems.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { Constructor } from "@/server/mixins.ts";

type MagicItemSeeds = MagicItemSeedSets[keyof MagicItemSeedSets];

/** Generating a book's magic items: its magic armor, shields and weapons, wondrous items, rings, rods and staffs. */
export function GeneratesMagicItems<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingMagicItems extends Base {
    /** A book's magic items' files, a file per kind, and the items' index with them. */
    writeMagicItems(ref: MagicItemReference, book: string) {
      const seeds = Library.book(book).magicItemSeeds(ref);
      const outDir = join(this.dir, book, "items");

      const files: [string, string, MagicItemSeeds][] = [
        ["magicArmor.ts", "MAGIC_ARMOR", seeds.magicArmor],
        ["magicShields.ts", "MAGIC_SHIELDS", seeds.magicShields],
        ["magicWeapons.ts", "MAGIC_WEAPONS", seeds.magicWeapons],
        ["wondrousItems.ts", "WONDROUS_ITEMS", seeds.wondrousItems],
        ["rings.ts", "RINGS", seeds.rings],
        ["rods.ts", "RODS", seeds.rods],
        ["staffs.ts", "STAFFS", seeds.staffs],
      ];

      for (const [filename, constName, items] of files) this.writeItemFile(join(outDir, filename), constName, items);

      this.writeItemIndex(outDir);

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
