import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { BOOK_FILES } from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating what a book copies from the core rules: its copied feats (cowFeats.ts) and spells (cowSpells.ts). */
export function GeneratesCopies<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingCopies extends Base {
    /** A book's cowFeats.ts: each core feat its classes' bonus feat lists name, with the lists it joins. */
    writeCowFeats(book: string) {
      if (!this.copiesFromCore(book)) return;
      const { path, list } = BOOK_FILES.cowFeats;
      this.writeList(join(this.dir, book, path), list, "CowFeatEntry", Library.book(book).cowFeats(), (file, copy) =>
        file.cowFeat(copy),
      );
    }

    /** A book's cowSpells.ts: each core spell it copies, with the lists it joins and its level on each. */
    writeCowSpells(book: string) {
      if (!this.copiesFromCore(book)) return;
      const { path, list } = BOOK_FILES.cowSpells;
      this.writeList(join(this.dir, book, path), list, "CowSpellEntry", Library.book(book).cowSpells(), (file, copy) =>
        file.cowSpell(copy),
      );
    }
  }
  return GeneratingCopies;
}
