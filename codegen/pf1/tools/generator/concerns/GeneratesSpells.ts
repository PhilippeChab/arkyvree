import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/pf1/tools/generator/code/CodeFile.ts";
import type { SpellReference } from "@/codegen/pf1/tools/types/spells.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * Generating a book's spells: a file per spell level, under what's left to review of its spells, and their index
 * (spells/index.ts).
 */
export function GeneratesSpells<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingSpells extends Base {
    /** The book's spells' index (spells/index.ts): each spell level file the generator wrote, its spells at its level. */
    private writeSpellIndex() {
      const files = BookLayout.spellLevels
        .map((level) => ({ level, ...BookLayout.spellFile(level) }))
        .filter(({ path }) => this.wrote(path));
      if (files.length === 0) return;

      const file = new CodeFile();
      file.spellIndex(files);
      this.write(BookLayout.files.spells.path, file.code());
    }

    /**
     * A spell reference's files, one per spell level with spells, each spell without its level (its file's), under what's
     * left to review of its spells; then their index. Logs what the book's spells leave out, which the Core Rulebook has
     * none of: later books' classes and descriptors.
     */
    writeSpells(ref: SpellReference) {
      const seeds = this.seeds.spells(ref);
      const spells = seeds.seeds();
      this.log(`Built ${spells.length} spell seeds`);
      const { classes, descriptors } = seeds.leftOut();
      if (classes.length > 0) this.log(`Spells: left out later books' classes' lists: ${classes.join(", ")}`);
      if (descriptors.length > 0) this.log(`Spells: left out descriptors: ${descriptors.join(", ")}`);

      // A spell above 9th level would have no file: the app has no epic spells
      const beyond = spells.find((spell) => !BookLayout.spellLevels.includes(spell.level));
      if (beyond) throw new Error(`${beyond.name}: level ${beyond.level}, where a spell's is 0 to 9`);

      const byLevel = Map.groupBy(spells, (spell) => spell.level);
      for (const level of BookLayout.spellLevels) {
        const levelSpells = byLevel.get(level);
        if (!levelSpells) continue;
        const { path, list } = BookLayout.spellFile(level);
        const file = new CodeFile();
        file.list(
          list,
          "SpellSeed",
          levelSpells.flatMap((spell) => file.spell(spell)),
        );
        this.write(path, file.code(), seeds.reviewNotes(level));
      }
      this.writeSpellIndex();
    }
  }
  return GeneratingSpells;
}
