import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import { ClassFiles } from "@/codegen/dnd3.5/tools/generator/ClassFiles.ts";
import type { ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's classes: each class's file and its feats', and its classes' epic bonus feats. */
export function GeneratesClasses<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingClasses extends Base {
    /** A class's files (`ClassFiles`): its file, opened by what's left to review in it, and its feats' file. */
    writeClass(ref: ClassReference) {
      for (const { path, code, notes } of new ClassFiles(this.seeds.classes(ref)).files())
        this.write(path, code, notes);
    }

    /**
     * The features its epic progression's classes take their epic bonus feats with (feats/classes/epicClasses.ts: the
     * core rules' "Epic Bonus Feat (Barbarian)"). None for a book without an epic progression.
     */
    writeEpicClassFeats() {
      if (!this.seeds.reference("epicClass")) return;
      const { path, list } = BookLayout.files.epicClassFeats;
      this.writeList(path, list, "FeatSeed", this.seeds.epicClassFeats(), (file, feat) => file.feat(feat));
    }
  }
  return GeneratingClasses;
}
