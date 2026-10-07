import { basename, join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import {
  BOOK_FILES,
  FEATS_FILE,
  getFeatTypeList,
  getTemplateList,
} from "@/database/packages/dnd35-from-parser/tools/generator/bookLayout.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { compareNames } from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's feats: its feat reference's, the core rules' favored enemies, their index and the aptitudes. */
export function GeneratesFeats<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingFeats extends Base {
    /** A book's aptitudes.ts: the aptitudes its seeds use (`BookSeeds.aptitudes`). */
    writeAptitudes(book: string) {
      const { path, list } = BOOK_FILES.aptitudes;
      this.writeList(
        join(this.dir, book, path),
        list,
        "string",
        Library.book(book).aptitudes(),
        (_, aptitude) => `  ${quote(aptitude)},`,
      );
    }

    /** A book's standalone feats' index (feats/index.ts): every list of its feats files, from its references. */
    writeFeatIndex(book: string) {
      const featRef = References.find(book, "feat");
      // Each feats file's lists, by file, as the generator writes them: the domains' feat pools', the reference's
      const seeds = Library.book(book);
      const feats = featRef && seeds.featSeeds(featRef);
      const featFiles = [
        {
          path: BOOK_FILES.domainFeats.path,
          lists: seeds.domainSeeds().poolFeats.length > 0 ? [BOOK_FILES.domainFeats.list] : [],
        },
        {
          path: FEATS_FILE,
          lists: feats
            ? [
                ...[...feats.byType.keys()].map(getFeatTypeList),
                ...feats.templates.map(({ familyName }) => getTemplateList(familyName)),
              ]
            : [],
        },
      ].filter(({ lists }) => lists.length > 0);
      // A book with classes has a feats folder, its standalone feats none or not
      if (featFiles.length === 0 && References.loadClasses(book).length === 0) return;

      const file = new CodeFile();
      const standalone: string[] = [];
      for (const { path, lists } of featFiles) {
        const sorted = lists.sort(compareNames);
        file.gather(`./${basename(path)}`, sorted);
        standalone.push(...sorted.map((list) => `  ...${list},`));
      }
      file.list(BOOK_FILES.standaloneFeats.list, "FeatSeed", standalone);
      this.write(join(this.dir, book, BOOK_FILES.standaloneFeats.path), file.code());
    }

    /** A feat reference's feats file (feats/feats.ts): its lists (`CodeFile.featsFile`). */
    writeFeats(ref: FeatReference, book: string) {
      const seeds = Library.book(book);
      const file = new CodeFile();
      file.featsFile(seeds.featSeeds(ref), seeds.requirableFamilies());
      this.write(join(this.dir, book, FEATS_FILE), file.code());
    }
  }
  return GeneratingFeats;
}
