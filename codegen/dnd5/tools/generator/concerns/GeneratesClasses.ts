import { type BaseBookGenerator } from "@/codegen/dnd5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd5/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/dnd5/tools/generator/code/CodeFile.ts";
import type { ClassSeed } from "@/content/dnd5/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's classes: each class's file and its feats'. */
export function GeneratesClasses<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /**
     * A class's files: its seed's (classes/<camel>.ts), and its feats' (feats/classes/<camel>.ts: its features', its
     * subclasses' and its proficiencies').
     */
    writeClass(seed: ClassSeed, feats: FeatSeed[]) {
      const classFile = new CodeFile();
      classFile.classSeed(seed);
      this.write(BookLayout.classFile(seed.name).path, classFile.code());

      const { path, list } = BookLayout.classFeatsFile(seed.name);
      this.writeList(path, list, "FeatSeed", feats, (file, feat) => file.feat(feat));
      this.log(`Built ${seed.name}: ${seed.features.length} features granted, ${feats.length} feats`);
    }
  }
  return GeneratingClasses;
}
