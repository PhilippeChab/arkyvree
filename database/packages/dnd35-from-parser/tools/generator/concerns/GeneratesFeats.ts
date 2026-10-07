import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { generateFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/code/featFiles.ts";
import { compareNames } from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { CORE_BOOK, getReferencePath } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { collectAptitudes } from "@/database/packages/dnd35-from-parser/tools/seeds/aptitudes.ts";
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

    /** Regenerate feats/index.ts for a book from all .ts files in feats/ and classes/index.ts. */
    writeFeatIndex(book: string) {
      const featDir = join(this.dir, book, "feats");

      // Discover all .ts files in feats/ (excluding index.ts and classes/)
      type FeatFileExport = { file: string; exports: string[] };
      const featFiles: FeatFileExport[] = [];
      try {
        for (const file of readdirSync(featDir).sort()) {
          if (!file.endsWith(".ts") || file === "index.ts") continue;
          const content = readFileSync(join(featDir, file), "utf-8");
          const exports: string[] = [];
          for (const m of content.matchAll(/export const (\w+): FeatSeed\[\]/g)) {
            exports.push(m[1]);
          }
          // By name, as a formatted file declares them: one this run just wrote declares them in the order it wrote
          // them, and the index is the same whichever it reads
          if (exports.length > 0) featFiles.push({ file, exports: exports.sort(compareNames) });
        }
      } catch {
        // dir doesn't exist
      }

      const allFeatExports = featFiles.flatMap((f) => f.exports);

      // Check if class feat index exists
      const classFeatIndexPath = join(featDir, "classes", "index.ts");
      const hasClassFeats = existsSync(classFeatIndexPath);

      if (allFeatExports.length === 0 && !hasClassFeats) return;

      // Each feat file's lists, imported once, and the lists of them all
      const file = new CodeFile();
      for (const { file: name, exports } of featFiles) file.gather(`./${name.replace(".ts", "")}.ts`, exports);
      if (hasClassFeats) file.gather("./classes/index.ts", ["ALL_CLASS_FEATS"]);
      const standalone = allFeatExports.map((name) => `  ...${name},`);
      // ALL_STANDALONE_FEATS: all non-class feats (empty array if none); ALL_FEATS: the class feats too
      file.list("ALL_STANDALONE_FEATS", "FeatSeed", standalone);
      file.list("ALL_FEATS", "FeatSeed", hasClassFeats ? [...standalone, "  ...ALL_CLASS_FEATS,"] : standalone);
      this.write(join(featDir, "index.ts"), file.code());
    }

    /** A feat reference's feats file (feats/feats.ts). */
    writeFeats(ref: FeatReference, book: string) {
      this.write(join(this.dir, book, "feats", "feats.ts"), generateFeatSeeds(ref));
    }
  }
  return GeneratingFeats;
}
