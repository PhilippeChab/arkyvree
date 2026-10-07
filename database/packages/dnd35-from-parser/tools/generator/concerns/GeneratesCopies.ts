import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating what a book copies from the core rules: its copied feats (cowFeats.ts) and spells (cowSpells.ts). */
export function GeneratesCopies<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingCopies extends Base {
    /** A book's cowFeats.ts: each core feat its classes' bonus feat lists name, with the lists it joins. */
    writeCowFeats(book: string) {
      if (!this.copiesFromCore(book)) return;
      const file = new CodeFile();
      file.list(
        "COW_FEATS",
        "CowFeatEntry",
        Library.book(book)
          .cowFeats()
          .map((copy) => file.cowFeat(copy)),
      );
      this.write(join(this.dir, book, "cowFeats.ts"), file.code());
    }

    /** A book's cowSpells.ts: each core spell it copies, with the lists it joins and its level on each. */
    writeCowSpells(book: string) {
      if (!this.copiesFromCore(book)) return;
      const file = new CodeFile();
      file.list(
        "COW_SPELLS",
        "CowSpellEntry",
        Library.book(book)
          .cowSpells()
          .map((copy) => file.cowSpell(copy)),
      );
      this.write(join(this.dir, book, "cowSpells.ts"), file.code());
    }
  }
  return GeneratingCopies;
}
