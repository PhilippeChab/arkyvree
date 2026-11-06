import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/pf1/tools/generator/code/CodeFile.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's standalone feats. */
export function GeneratesFeats<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingFeats extends Base {
    /**
     * The book's feats file (feats/feats.ts): its standalone feats (its feat reference's seeds), each with every
     * aptitude it's taken in (the generator's, its classes' bonus feat lists' among them), a family taken per option
     * written as its feats per option (`FeatSeeds.family`), under what's left to review in them (`FeatSeeds.notes`).
     * The lists it exports are returned, for its index.
     */
    writeFeats(feats: FeatSeed[]): string[] {
      const ref = this.seeds.reference("feat");
      const featSeeds = ref && this.seeds.feats(ref);
      const file = new CodeFile();
      const lists = file.featsFile(feats, (name) => featSeeds?.family(name));
      this.write(BookLayout.featsFile, file.code(), featSeeds?.notes() ?? []);
      this.log(`Built ${feats.length} feat seeds`);
      return lists;
    }
  }
  return GeneratingFeats;
}
