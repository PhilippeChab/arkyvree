import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import {
  classSpells,
  inheritedLevel,
  inheritedLists,
} from "@/database/packages/dnd35-from-parser/tools/buildSeeds/classes.ts";
import { buildSpellSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/spells.ts";
import {
  type BaseGenerator,
  GENERATED_HEADER,
} from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { generateSpellFiles } from "@/database/packages/dnd35-from-parser/tools/generator/code/spellFiles.ts";
import { REFERENCE_DIR, referenceBooks } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { classReferences, loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's spells: a file per spell level, their index, and the core spells its classes' lists copy. */
export function GeneratesSpells<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingSpells extends Base {
    /** Regenerate cowSpells.ts for a book. Scans all OTHER books' spell references for spells that
     *  have levelEntries matching this book's casting classes. Produces per-class-level entries
     *  so the seed uses the correct level for each class (not the global minimum). */
    writeCowSpells(book: string) {
      if (!this.copiesFromCore(book)) return;
      const classes = classReferences(book);

      // Build map: className → aptitude name for classes that have spell lists
      const classToApt = new Map<string, string>();
      for (const { ref } of classes) {
        if (classSpells(ref) && ref.raw?.name) classToApt.set(ref.raw.name, `${ref.raw.name} Spells`);
      }
      // The lists classes draw on (`inheritsFrom`), each its class's aptitude
      const bookInheritedLists = inheritedLists(book);

      // Load this book's own spell names (these don't need COW — they're seeded directly)
      const bookSpellNames = new Set<string>();
      const bookSpellPath = join(REFERENCE_DIR, book, "spells.json");
      if (existsSync(bookSpellPath)) {
        const ref = loadReference(bookSpellPath, "spell");
        for (const spell of ref.raw) bookSpellNames.add(spell.name);
      }

      // Scan ALL other books' spell references
      type CowEntry = { spell: string; aptitudes: { aptitude: string; level: number }[] };
      const entries = new Map<string, CowEntry>();
      // The spells an inherited list can take: the base book's and this book's
      const inheritable = new Set<string>();

      // Find the base book (the one defining core classes like Wizard).
      // COW only makes sense for spells from the base book, not siblings.
      const baseBook = referenceBooks().find((b) => classReferences(b).some(({ ref }) => ref.raw?.name === "Wizard"));
      const isBaseBook = book === baseBook;
      for (const otherBook of referenceBooks()) {
        const spellPath = join(REFERENCE_DIR, otherBook, "spells.json");
        if (!existsSync(spellPath)) continue;

        const ref = loadReference(spellPath, "spell");
        for (const spell of ref.raw) {
          const isSameBook = bookSpellNames.has(spell.name);
          const isFromBase = otherBook === baseBook;
          const matchedApts: { aptitude: string; level: number }[] = [];
          const overrideLe = ref.overrides?.[spell.name]?.levelEntries ?? [];
          const levelEntries = [...spell.levelEntries, ...overrideLe];
          for (const le of levelEntries) {
            // Direct class matches: only from the base book (not siblings).
            // Same-book spells are seeded by seedPowers directly.
            // The base book itself never needs COW entries (extensions link via seedPowers).
            if (!isSameBook && !isBaseBook && isFromBase) {
              const aptName = classToApt.get(le.className);
              if (aptName) {
                matchedApts.push({ aptitude: aptName, level: le.level });
              }
            }
          }
          // Inherited spell lists: from the base book + current book only
          if (isSameBook || isFromBase) {
            inheritable.add(spell.name);
            for (const { aptitude, list } of bookInheritedLists) {
              const level = inheritedLevel(spell, levelEntries, list);
              if (level !== undefined) matchedApts.push({ aptitude, level });
            }
          }

          if (matchedApts.length === 0) continue;

          const existing = entries.get(spell.name);
          if (existing) {
            // Merge aptitudes (deduplicate by aptitude name)
            for (const apt of matchedApts) {
              if (!existing.aptitudes.some((a) => a.aptitude === apt.aptitude)) {
                existing.aptitudes.push(apt);
              }
            }
          } else {
            entries.set(spell.name, { spell: spell.name, aptitudes: matchedApts });
          }
        }
      }

      // A list's additions, at their level there
      for (const { aptitude, list } of bookInheritedLists) {
        for (const [level, names] of Object.entries(list.additions ?? {})) {
          for (const name of names) {
            if (!inheritable.has(name))
              throw new Error(`${aptitude}: "${name}" is neither a core spell nor the book's`);
            const entry = entries.get(name) ?? { spell: name, aptitudes: [] };
            entry.aptitudes = [
              ...entry.aptitudes.filter((a) => a.aptitude !== aptitude),
              { aptitude, level: Number(level) },
            ];
            entries.set(name, entry);
          }
        }
      }

      const outPath = join(this.dir, book, "cowSpells.ts");

      const lines: string[] = [];
      lines.push(...GENERATED_HEADER);
      lines.push(`import type { CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";`);
      lines.push(``);
      lines.push(`export const COW_SPELLS: CowSpellEntry[] = [`);
      for (const entry of entries.values()) {
        const aptStr = entry.aptitudes.map((a) => `{ aptitude: ${quote(a.aptitude)}, level: ${a.level} }`).join(", ");
        lines.push(`  { spell: ${quote(entry.spell)}, aptitudes: [${aptStr}] },`);
      }
      lines.push(`];`);
      lines.push(``);

      this.write(outPath, lines.join("\n"));
    }

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
      const levelFiles: { file: string; level: number; constName: string }[] = [];

      if (allFiles.includes("cantrips.ts")) {
        levelFiles.push({ file: "cantrips.ts", level: 0, constName: "CANTRIPS" });
      }
      for (let i = 1; i <= 9; i++) {
        const fname = `level${i}.ts`;
        if (allFiles.includes(fname)) {
          levelFiles.push({ file: fname, level: i, constName: `LEVEL_${i}_SPELLS` });
        }
      }

      if (levelFiles.length === 0) return;

      const lines = [
        ...this.indexHead("SpellSeed", levelFiles),
        ...this.listExport(
          "ALL_SPELLS",
          "SpellSeed",
          levelFiles.map((lf) => `...${lf.constName}.map((p) => ({ ...p, level: ${lf.level} }))`),
        ),
      ];

      const outPath = join(spellDir, "index.ts");
      this.write(outPath, lines.join("\n"));
    }

    /** A spell reference's files, one per spell level, the stale ones removed. */
    writeSpells(ref: SpellReference, book: string) {
      const { spells } = buildSpellSeeds(ref, book);
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
