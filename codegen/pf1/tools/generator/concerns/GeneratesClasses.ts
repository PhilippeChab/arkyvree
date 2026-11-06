import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/pf1/tools/generator/code/CodeFile.ts";
import type { ClassSeed } from "@/content/pf1/builders/classes/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's classes: each class's file and its feats'. */
export function GeneratesClasses<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /** A class's files: its seed's (classes/<camel>.ts), and its feats' (feats/classes/<camel>.ts). */
    writeClass(seed: ClassSeed, feats: FeatSeed[]) {
      const classFile = new CodeFile();
      classFile.classSeed(seed);
      this.write(BookLayout.classFile(seed.name).path, classFile.code());

      const { path, list } = BookLayout.classFeatsFile(seed.name);
      this.writeList(path, list, "FeatSeed", feats, (file, feat) => file.feat(feat));
    }
  }
  return GeneratingClasses;
}
