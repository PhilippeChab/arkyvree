import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * Generating what a book's kinds make together: its aptitudes, and what it copies from the core rules (none: the
 * Core Rulebook is the core rules, so its copies are empty lists).
 */
export function GeneratesAptitudes<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingAptitudes extends Base {
    /** The book's aptitudes.ts: `aptitudes`, every aptitude its seeds name (`BookAptitudes`). */
    writeAptitudes(aptitudes: string[]) {
      const { path, list } = BookLayout.files.aptitudes;
      this.writeList(path, list, "string", aptitudes, (file, aptitude) => `  ${file.quote(aptitude)},`);
    }

    /** The book's cowFeats.ts and cowSpells.ts: the core feats and spells it changes, none. */
    writeCopies() {
      const { cowFeats, cowSpells } = BookLayout.files;
      this.writeList(cowFeats.path, cowFeats.list, "CowFeatEntry", [], () => []);
      this.writeList(cowSpells.path, cowSpells.list, "CowSpellEntry", [], () => []);
    }
  }
  return GeneratingAptitudes;
}
