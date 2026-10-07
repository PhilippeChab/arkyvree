import { type BaseBookGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating what a book copies from the core rules: its copied feats (cowFeats.ts) and spells (cowSpells.ts). */
export function GeneratesCopies<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingCopies extends Base {
    /** The book's cowFeats.ts: each core feat its classes' bonus feat lists name, with the lists it joins. */
    writeCowFeats() {
      if (!this.copiesFromCore()) return;
      const { path, list } = BookLayout.files.cowFeats;
      this.writeList(path, list, "CowFeatEntry", this.seeds.cowFeats(), (file, copy) => file.cowFeat(copy));
    }

    /** The book's cowSpells.ts: each core spell it copies, with the lists it joins and its level on each. */
    writeCowSpells() {
      if (!this.copiesFromCore()) return;
      const { path, list } = BookLayout.files.cowSpells;
      this.writeList(path, list, "CowSpellEntry", this.seeds.cowSpells(), (file, copy) => file.cowSpell(copy));
    }
  }
  return GeneratingCopies;
}
