import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/dnd3.5/tools/generator/code/CodeFile.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's feats and the aptitudes its seeds use. */
export function GeneratesFeats<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingFeats extends Base {
    /** The book's aptitudes.ts: the aptitudes its seeds use (`BookSeeds.aptitudes`). */
    writeAptitudes() {
      const { path, list } = BookLayout.files.aptitudes;
      this.writeList(path, list, "string", this.seeds.aptitudes(), (file, aptitude) => `  ${file.quote(aptitude)},`);
    }

    /** A feat reference's feats file (feats/feats.ts): its lists (`CodeFile.featsFile`). */
    writeFeats(ref: FeatReference) {
      const file = new CodeFile();
      file.featsFile(this.seeds.feats(ref), this.seeds.requirableFamilies());
      this.write(BookLayout.featsFile, file.code());
    }
  }
  return GeneratingFeats;
}
