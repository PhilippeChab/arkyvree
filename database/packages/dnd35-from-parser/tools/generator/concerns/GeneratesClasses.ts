import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { generateClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/code/classFeatsFile.ts";
import { ClassFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/ClassFile.ts";
import { toConstName } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { buildClassSeed } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/classSeed.ts";
import { toCamelCase } from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { getClassReviewNotes } from "@/database/packages/dnd35-from-parser/tools/validate/classReview.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's classes: each class's file and its feats', and their indexes. */
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
        this.write(classPath, new ClassFile(buildClassSeed(ref)).classCode(), getClassReviewNotes(ref));
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

      // Each feat once, its first class's: a feat like "Familiar" may appear in multiple class feat files
      lines.push(`const _allClassFeats: FeatSeed[] = [`);
      for (const e of entries) {
        lines.push(`  ...${e.constName},`);
      }
      lines.push(`];`);
      lines.push(
        `export const ALL_CLASS_FEATS: FeatSeed[] = [...Map.groupBy(_allClassFeats, (f) => f.name).values()].map(([f]) => f);`,
      );
      lines.push(``);

      const outPath = join(classFeatDir, "index.ts");
      this.write(outPath, lines.join("\n"));
    }

    /** Regenerate classes/index.ts for a book from class reference JSONs. */
    writeClassIndex(book: string) {
      const classes = ReferenceLoader.loadClasses(book).sort((a, b) => (a.file < b.file ? -1 : 1));
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
  }
  return GeneratingClasses;
}
