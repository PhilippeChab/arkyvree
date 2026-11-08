import { type BaseBookGenerator } from "@/codegen/dnd5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd5/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/dnd5/tools/generator/code/CodeFile.ts";
import type { LeveledSpellSeed } from "@/content/dnd5/builders/spells/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's spells: a file per spell level, and their index (spells/index.ts). */
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

    /** The book's spell files, one per spell level with spells, each spell without its level (its file's); then their index. */
    writeSpells(spells: LeveledSpellSeed[]) {
      this.log(`Built ${spells.length} spells`);
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
        this.write(path, file.code());
      }
      this.writeSpellIndex();
    }
  }
  return GeneratingSpells;
}
