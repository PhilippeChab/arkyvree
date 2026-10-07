import { type BaseBookGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseBookGenerator.ts";
import { ClassFiles } from "@/database/packages/dnd35-from-parser/tools/generator/ClassFiles.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's classes: each class's file and its feats'. */
export function GeneratesClasses<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /** A class's files (`ClassFiles`): its file, opened by what's left to review in it, and its feats' file. */
    writeClass(ref: ClassReference) {
      for (const { path, code, notes } of new ClassFiles(this.seeds.classes(ref)).files())
        this.write(path, code, notes);
    }
  }
  return GeneratingClasses;
}
