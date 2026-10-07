import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { generateSpellFiles } from "@/database/packages/dnd35-from-parser/tools/generator/code/spellFiles.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's spells: a file per spell level, and their index. */
export function GeneratesSpells<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingSpells extends Base {
    /** Regenerate spells/index.ts for a book from existing level .ts files. */
    writeSpellIndex(book: string) {
      const spellDir = join(this.dir, book, "spells");
      let allFiles: string[];
      try {
        allFiles = readdirSync(spellDir);
      } catch {
        return; // no spells for this book
      }

      // Match cantrips.ts and level*.ts (the standard spell level files)
      const levelFiles: { constName: string; file: string; level: number }[] = [];

      if (allFiles.includes("cantrips.ts")) levelFiles.push({ file: "cantrips.ts", level: 0, constName: "CANTRIPS" });

      for (let i = 1; i <= 9; i++) {
        const fname = `level${i}.ts`;
        if (allFiles.includes(fname)) levelFiles.push({ file: fname, level: i, constName: `LEVEL_${i}_SPELLS` });
      }

      if (levelFiles.length === 0) return;

      const file = new CodeFile();
      for (const { file: name, constName } of levelFiles) file.gather(`./${name}`, [constName]);
      file.list(
        "ALL_SPELLS",
        "SpellSeed",
        levelFiles.map((lf) => `  ...${lf.constName}.map((p) => ({ ...p, level: ${lf.level} })),`),
      );
      this.write(join(spellDir, "index.ts"), file.code());
    }

    /** A spell reference's files, one per spell level, the stale ones removed. */
    writeSpells(ref: SpellReference, book: string) {
      const spells = Library.book(book).spellSeeds(ref);
      this.log(`Built ${spells.length} spell seeds`);

      // Generate .ts files per level
      const files = generateSpellFiles(spells);
      const spellDir = join(this.dir, book, "spells");

      // Remove stale level files that won't be regenerated (e.g. cantrips.ts when no level-0 spells)
      const LEVEL_FILES = ["cantrips.ts", ...Array.from({ length: 9 }, (_, i) => `level${i + 1}.ts`)];
      for (const f of LEVEL_FILES) {
        if (!files.has(f)) {
          try {
            unlinkSync(join(spellDir, f));
          } catch {
            // doesn't exist
          }
        }
      }

      for (const [filename, code] of files) {
        const filePath = join(spellDir, filename);
        this.write(filePath, code);
      }
    }
  }
  return GeneratingSpells;
}
