import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  type BaseGenerator,
  GENERATED_HEADER,
} from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import {
  generateClassFeatSeeds,
  generateClassSeed,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/classFiles.ts";
import { quote, toConstName } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { toCamelCase } from "@/database/packages/dnd35-from-parser/tools/names.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { classReferences, loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's classes: each class's file and its feats', their indexes, and the core feats they copy. */
export function GeneratesClasses<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /** A class's file and its feats' file, or neither for a class left out of the seed. */
    writeClass(ref: ClassReference, book: string) {
      const slug = toCamelCase(ref.raw.name);
      const classPath = join(this.dir, book, "classes", `${slug}.ts`);
      const featPath = join(this.dir, book, "feats", "classes", `${slug}.ts`);

      if (ref.overrides?.skip) {
        // A class left out of the seed: its files go, and the indexes leave it out
        rmSync(classPath, { force: true });
        rmSync(featPath, { force: true });
      } else {
        this.write(classPath, generateClassSeed(ref));
        this.write(featPath, generateClassFeatSeeds(ref));
      }
    }

    /** Regenerate feats/classes/index.ts for a book from all generated class feat .ts files. */
    writeClassFeatIndex(book: string) {
      const classFeatDir = join(this.dir, book, "feats", "classes");
      let tsFiles: string[];
      try {
        tsFiles = readdirSync(classFeatDir)
          .filter((f) => f.endsWith(".ts") && f !== "index.ts")
          .sort();
      } catch {
        return; // no class feat files for this book
      }

      if (tsFiles.length === 0) return;

      type FeatEntry = { slug: string; constName: string };
      const entries: FeatEntry[] = [];

      for (const file of tsFiles) {
        const slug = file.replace(".ts", "");
        const content = readFileSync(join(classFeatDir, file), "utf-8");
        const match = content.match(/export const (\w+_FEATS)/);
        if (match) {
          entries.push({ slug, constName: match[1] });
        }
      }

      if (entries.length === 0) return;

      const lines = this.indexHead(
        "FeatSeed",
        entries.map((e) => ({ constName: e.constName, file: `${e.slug}.ts` })),
      );

      // Deduplicate: a feat like "Familiar" may appear in multiple class feat files
      lines.push(`const _allClassFeats: FeatSeed[] = [`);
      for (const e of entries) {
        lines.push(`  ...${e.constName},`);
      }
      lines.push(`];`);
      lines.push(`const _seen = new Set<string>();`);
      lines.push(`export const ALL_CLASS_FEATS: FeatSeed[] = _allClassFeats.filter((f) => {`);
      lines.push(`  if (_seen.has(f.name)) return false;`);
      lines.push(`  _seen.add(f.name);`);
      lines.push(`  return true;`);
      lines.push(`});`);
      lines.push(``);

      const outPath = join(classFeatDir, "index.ts");
      this.write(outPath, lines.join("\n"));
    }

    /** Regenerate classes/index.ts for a book from class reference JSONs. */
    writeClassIndex(book: string) {
      const classes = classReferences(book).sort((a, b) => (a.file < b.file ? -1 : 1));
      if (classes.length === 0) return; // no classes for this book

      type ClassEntry = { slug: string; constName: string; isBase: boolean };
      const entries: ClassEntry[] = [];

      for (const { ref } of classes) {
        if (!ref.raw?.name) continue;
        const slug = toCamelCase(ref.raw.name);
        const levels = ref.detected?.levels ?? 0;
        entries.push({
          slug,
          constName: toConstName(ref.raw.name),
          isBase: levels === 20,
        });
      }

      const names = (list: ClassEntry[]) => list.map((e) => e.constName);
      const baseEntries = entries.filter((e) => e.isBase);
      const prestigeEntries = entries.filter((e) => !e.isBase);
      const lines = [
        ...this.indexHead(
          "ClassSeed",
          entries.map((e) => ({ constName: e.constName, file: `${e.slug}.ts` })),
        ),
        ...this.listExport("ALL_CLASSES", "ClassSeed", names(entries)),
        ...(baseEntries.length > 0 ? this.listExport("ALL_BASE_CLASSES", "ClassSeed", names(baseEntries)) : []),
        ...(prestigeEntries.length > 0
          ? this.listExport("ALL_PRESTIGE_CLASSES", "ClassSeed", names(prestigeEntries))
          : []),
      ];

      const genClassDir = join(this.dir, book, "classes");
      const outPath = join(genClassDir, "index.ts");
      this.write(outPath, lines.join("\n"));
    }

    /** Regenerate cowFeats.ts for a book from bonusFeatLists in class reference JSONs.
     *  Only emits entries for feats that don't already exist in the book's own feat pool
     *  (i.e. cross-book references that actually need COW). Same-book feats already get
     *  their aptitudes added directly by the feat generator. */
    writeCowFeats(book: string) {
      if (!this.copiesFromCore(book)) return;
      const classes = classReferences(book);

      // Load the book's own raw feat names — these already get aptitudes via the feat generator
      const bookFeats = new Set<string>();
      const bookFeatsPath = join(REFERENCE_DIR, book, "feats.json");
      if (existsSync(bookFeatsPath)) {
        const ref = loadReference(bookFeatsPath, "feat");
        for (const feat of ref.raw) bookFeats.add(feat.name);
      }

      // Also collect class feature seed names — these are generated as feats by the class feat generator
      const classFeatureNames = new Set<string>();
      for (const { ref } of classes) {
        for (const feat of Object.values(ref.mapping.features)) {
          if (feat.seedName) classFeatureNames.add(feat.seedName);
        }
      }

      type CowEntry = { feat: string; requirements: { className: string; level: number }[]; aptitudes: string[] };
      const entries: CowEntry[] = [];

      for (const { ref } of classes) {
        const bonusFeatLists = ref.overrides?.bonusFeatLists ?? ref.detected?.bonusFeatLists;
        if (!bonusFeatLists?.length) continue;

        for (const list of bonusFeatLists) {
          for (const feat of list.feats) {
            // Skip feats that exist in this book's own feat pool or as class features —
            // the feat generator already adds the aptitude directly
            if (bookFeats.has(feat) || classFeatureNames.has(feat)) continue;
            entries.push({ feat, requirements: [], aptitudes: [list.aptitude] });
          }
        }
      }

      const outPath = join(this.dir, book, "cowFeats.ts");

      // Deduplicate: a feat might appear in multiple lists
      const deduped = new Map<string, CowEntry>();
      for (const entry of entries) {
        const existing = deduped.get(entry.feat);
        if (existing) {
          for (const apt of entry.aptitudes) {
            if (!existing.aptitudes.includes(apt)) existing.aptitudes.push(apt);
          }
        } else {
          deduped.set(entry.feat, { ...entry });
        }
      }

      const lines: string[] = [];
      lines.push(...GENERATED_HEADER);
      lines.push(`import type { CowFeatEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";`);
      lines.push(``);
      lines.push(`export const COW_FEATS: CowFeatEntry[] = [`);
      for (const entry of deduped.values()) {
        const aptStr = entry.aptitudes.map(quote).join(", ");
        lines.push(`  { feat: ${quote(entry.feat)}, requirements: [], aptitudes: [${aptStr}] },`);
      }
      lines.push(`];`);
      lines.push(``);

      this.write(outPath, lines.join("\n"));
    }
  }
  return GeneratingClasses;
}
