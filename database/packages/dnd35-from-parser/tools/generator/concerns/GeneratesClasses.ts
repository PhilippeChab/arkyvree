import { type BaseBookGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's classes: each class's file and its feats'. */
export function GeneratesClasses<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /** A class's file, opened by what's left to review in it, and its feats' file. */
    writeClass(ref: ClassReference) {
      const seeds = this.seeds.classes(ref);
      const file = new CodeFile();
      file.classSeed(seeds.seed());
      this.write(BookLayout.classFile(ref.raw.name).path, file.code(), seeds.reviewNotes());
      const { path, list } = BookLayout.classFeatsFile(ref.raw.name);
      this.writeList(path, list, "FeatSeed", seeds.feats(), (featFile, feat) => featFile.feat(feat));
    }
  }
  return GeneratingClasses;
}
