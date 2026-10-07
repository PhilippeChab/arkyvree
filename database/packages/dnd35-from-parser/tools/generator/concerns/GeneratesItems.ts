import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { buildItemSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/items.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's mundane items: its weapons, armor, shields and goods. */
export function GeneratesItems<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingItems extends Base {
    /** A book's mundane items' files, a file per kind, and their index. */
    writeItems(ref: ItemReference, book: string) {
      const seeds = buildItemSeeds(ref);
      const outDir = join(this.dir, book, "items");
      this.writeItemFile(join(outDir, "simpleWeapons.ts"), "SIMPLE_WEAPONS", seeds.simpleWeapons);
      this.writeItemFile(join(outDir, "martialWeapons.ts"), "MARTIAL_WEAPONS", seeds.martialWeapons);
      this.writeItemFile(join(outDir, "exoticWeapons.ts"), "EXOTIC_WEAPONS", seeds.exoticWeapons);
      this.writeItemFile(join(outDir, "armor.ts"), "ARMOR", seeds.armor);
      this.writeItemFile(join(outDir, "shields.ts"), "SHIELDS", seeds.shields);
      this.writeItemFile(join(outDir, "goods.ts"), "GOODS", seeds.goods);
      this.writeItemIndex(outDir);

      this.log(
        `\nDone! Generated ${seeds.simpleWeapons.length} simple, ${seeds.martialWeapons.length} martial, ${seeds.exoticWeapons.length} exotic weapons`,
      );
      this.log(`  ${seeds.armor.length} armor, ${seeds.shields.length} shields, ${seeds.goods.length} goods`);
    }
  }
  return GeneratingItems;
}
