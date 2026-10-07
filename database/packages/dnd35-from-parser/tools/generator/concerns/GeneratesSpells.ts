import { readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import {
  BOOK_FILES,
  getSpellFile,
  SPELL_LEVELS,
} from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's spells: a file per spell level, and their index. */
export function GeneratesSpells<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingSpells extends Base {
    /** Regenerate spells/index.ts for a book from existing level .ts files. */
    writeSpellIndex(book: string) {
      const spellDir = dirname(join(this.dir, book, BOOK_FILES.spells.path));
      let allFiles: string[];
      try {
        allFiles = readdirSync(spellDir);
      } catch {
        return; // no spells for this book
      }

      // The spell level files it has (cantrips.ts, level1.ts…), by level
      const levelFiles = SPELL_LEVELS.map((level) => ({ level, ...getSpellFile(level) })).filter(({ path }) =>
        allFiles.includes(basename(path)),
      );

      if (levelFiles.length === 0) return;

      const file = new CodeFile();
      for (const { path, list } of levelFiles) file.gather(`./${basename(path)}`, [list]);
      file.list(
        BOOK_FILES.spells.list,
        "SpellSeed",
        levelFiles.map(({ level, list }) => `  ...${list}.map((p) => ({ ...p, level: ${level} })),`),
      );
      this.write(join(this.dir, book, BOOK_FILES.spells.path), file.code());
    }

    /** A spell reference's files, one per spell level, the stale ones removed. */
    writeSpells(ref: SpellReference, book: string) {
      const spells = Library.book(book).spellSeeds(ref);
      this.log(`Built ${spells.length} spell seeds`);

      // A file per spell level, its spells without their level (its file's), the levels without spells' removed
      const byLevel = Map.groupBy(spells, (spell) => spell.level);
      for (const level of SPELL_LEVELS) {
        const { path, list } = getSpellFile(level);
        const levelSpells = byLevel.get(level);
        if (levelSpells) {
          this.writeList(join(this.dir, book, path), list, "PowerSeed", levelSpells, (file, spell) =>
            file.spell(spell),
          );
        } else {
          rmSync(join(this.dir, book, path), { force: true });
        }
      }
    }
  }
  return GeneratingSpells;
}
