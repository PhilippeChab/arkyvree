import { type BaseBookGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { Constructor } from "@/server/mixins.ts";

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
