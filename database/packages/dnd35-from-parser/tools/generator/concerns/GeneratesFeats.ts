import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { generateFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/code/featFiles.ts";
import { getFeatsFileLists } from "@/database/packages/dnd35-from-parser/tools/generator/code/FeatsFile.ts";
import { compareNames } from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { CORE_BOOK, getReferencePath } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { collectAptitudes } from "@/database/packages/dnd35-from-parser/tools/seeds/aptitudes.ts";
import { buildBookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/domains.ts";
import { getFeatAptitudeSources } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import { buildWizardSchoolSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/wizardSchools.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import { buildCoreFeats } from "@/database/packages/dnd35/data/feats/coreFeats.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's feats: its feat reference's, the core rules' favored enemies, their index and the aptitudes. */
export function GeneratesFeats<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingFeats extends Base {
    /** Regenerate aptitudes.ts for a book from reference JSONs: its feats', and the core rules' hand-written feats'. */
    writeAptitudes(book: string) {
      const featRef = ReferenceLoader.find(book, "feat");
      const feats = [
        ...(featRef ? getFeatAptitudeSources(featRef) : []),
        ...(book === CORE_BOOK
          ? buildCoreFeats(
              buildWizardSchoolSeeds(ReferenceLoader.load(getReferencePath(CORE_BOOK, "wizardSchool"), "wizardSchool")),
            )
          : []),
      ];

      const aptitudes = collectAptitudes(feats, book);

      const file = new CodeFile();
      file.list(
        "ALL_APTITUDES",
        "string",
        aptitudes.map((aptitude) => `  ${quote(aptitude)},`),
      );
      this.write(join(this.dir, book, "aptitudes.ts"), file.code());
    }

    /** A book's standalone feats' index (feats/index.ts): every list of its feats files, from its references. */
    writeFeatIndex(book: string) {
      const featRef = ReferenceLoader.find(book, "feat");
      // Each feats file's lists, by file, as the generator writes them: the domains' feat pools', the reference's
      const featFiles = [
        { file: "domainFeats.ts", lists: buildBookDomainSeeds(book).poolFeats.length > 0 ? ["DOMAIN_POOL_FEATS"] : [] },
        { file: "feats.ts", lists: featRef ? getFeatsFileLists(featRef) : [] },
      ].filter(({ lists }) => lists.length > 0);
      // A book with classes has a feats folder, its standalone feats none or not
      if (featFiles.length === 0 && ReferenceLoader.loadClasses(book).length === 0) return;

      const file = new CodeFile();
      const standalone: string[] = [];
      for (const { file: name, lists } of featFiles) {
        const sorted = lists.sort(compareNames);
        file.gather(`./${name}`, sorted);
        standalone.push(...sorted.map((list) => `  ...${list},`));
      }
      file.list("ALL_STANDALONE_FEATS", "FeatSeed", standalone);
      this.write(join(this.dir, book, "feats", "index.ts"), file.code());
    }

    /** A feat reference's feats file (feats/feats.ts). */
    writeFeats(ref: FeatReference, book: string) {
      this.write(join(this.dir, book, "feats", "feats.ts"), generateFeatSeeds(ref));
    }
  }
  return GeneratingFeats;
}
