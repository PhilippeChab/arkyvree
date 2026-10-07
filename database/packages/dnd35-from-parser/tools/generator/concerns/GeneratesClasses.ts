import { rmSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { generateClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/code/classFeatsFile.ts";
import { ClassFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/ClassFile.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { toConstName } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
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

      if (ref.mapping.skip) {
        // A class left out of the seed: its files go, and the indexes leave it out
        rmSync(classPath, { force: true });
        rmSync(featPath, { force: true });
      } else {
        this.write(classPath, new ClassFile(Library.book(book).classSeed(ref)).classCode(), getClassReviewNotes(ref));
        this.write(featPath, generateClassFeatSeeds(ref));
      }
    }

    /** A book's class feats' index (feats/classes/index.ts): each of its classes' feats file, from its references. */
    writeClassFeatIndex(book: string) {
      const entries = ReferenceLoader.loadClasses(book)
        .map(({ ref }) => ({ slug: toCamelCase(ref.raw.name), constName: `${toConstName(ref.raw.name)}_CLASS_FEATS` }))
        .sort((a, b) => (a.slug < b.slug ? -1 : 1));
      if (entries.length === 0) return;

      const file = new CodeFile();
      for (const e of entries) file.gather(`./${e.slug}.ts`, [e.constName]);
      file.declare("FeatSeed");
      // Each feat once, its first class's: a feat like "Familiar" may appear in multiple class feat files
      file.lines.push(
        `const _allClassFeats: FeatSeed[] = [`,
        ...entries.map((e) => `  ...${e.constName},`),
        `];`,
        `export const ALL_CLASS_FEATS: FeatSeed[] = [...Map.groupBy(_allClassFeats, (f) => f.name).values()].map(([f]) => f);`,
        ``,
      );
      this.write(join(this.dir, book, "feats", "classes", "index.ts"), file.code());
    }

    /** A book's classes' index (classes/index.ts): each of its classes' file, from its references, by reference. */
    writeClassIndex(book: string) {
      const classes = ReferenceLoader.loadClasses(book).filter(({ ref }) => ref.raw?.name);
      if (classes.length === 0) return;

      const file = new CodeFile();
      for (const { ref } of classes) file.gather(`./${toCamelCase(ref.raw.name)}.ts`, [toConstName(ref.raw.name)]);
      file.list(
        "ALL_CLASSES",
        "ClassSeed",
        classes.map(({ ref }) => `  ${toConstName(ref.raw.name)},`),
      );
      this.write(join(this.dir, book, "classes", "index.ts"), file.code());
    }
  }
  return GeneratingClasses;
}
