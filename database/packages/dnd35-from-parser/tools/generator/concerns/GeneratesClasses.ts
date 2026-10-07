import { basename, join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import {
  BOOK_FILES,
  getClassFeatsFile,
  getClassFile,
} from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { getClassReviewNotes } from "@/database/packages/dnd35-from-parser/tools/validate/classReview.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's classes: each class's file and its feats', and their indexes. */
export function GeneratesClasses<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /** A class's file and its feats' file. */
    writeClass(ref: ClassReference, book: string) {
      const classFile = getClassFile(ref.raw.name);
      const featsFile = getClassFeatsFile(ref.raw.name);
      const classPath = join(this.dir, book, classFile.path);
      const featPath = join(this.dir, book, featsFile.path);

      const seeds = Library.book(book);
      const file = new CodeFile();
      file.classSeed(seeds.classes(ref).seed());
      this.write(classPath, file.code(), getClassReviewNotes(ref));
      this.writeList(featPath, featsFile.list, "FeatSeed", seeds.classes(ref).feats(), (featFile, feat) =>
        featFile.feat(feat),
      );
    }

    /** A book's class feats' index (feats/classes/index.ts): each of its classes' feats file, from its references. */
    writeClassFeatIndex(book: string) {
      const entries = References.loadClasses(book)
        .map(({ ref }) => getClassFeatsFile(ref.raw.name))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
      if (entries.length === 0) return;

      const file = new CodeFile();
      for (const e of entries) file.gather(`./${basename(e.path)}`, [e.list]);
      file.declare("FeatSeed");
      // Each feat once, its first class's: a feat like "Familiar" may appear in multiple class feat files
      file.lines.push(
        `const _allClassFeats: FeatSeed[] = [`,
        ...entries.map((e) => `  ...${e.list},`),
        `];`,
        `export const ${BOOK_FILES.classFeats.list}: FeatSeed[] = [...Map.groupBy(_allClassFeats, (f) => f.name).values()].map(([f]) => f);`,
        ``,
      );
      this.write(join(this.dir, book, BOOK_FILES.classFeats.path), file.code());
    }

    /** A book's classes' index (classes/index.ts): each of its classes' file, from its references, by reference. */
    writeClassIndex(book: string) {
      const classes = References.loadClasses(book).filter(({ ref }) => ref.raw?.name);
      if (classes.length === 0) return;

      const file = new CodeFile();
      const files = classes.map(({ ref }) => getClassFile(ref.raw.name));
      for (const { path, list } of files) file.gather(`./${basename(path)}`, [list]);
      file.list(
        BOOK_FILES.classes.list,
        "ClassSeed",
        files.map(({ list }) => `  ${list},`),
      );
      this.write(join(this.dir, book, BOOK_FILES.classes.path), file.code());
    }
  }
  return GeneratingClasses;
}
