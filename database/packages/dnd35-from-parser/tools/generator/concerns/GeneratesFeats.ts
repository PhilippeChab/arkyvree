import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { collectAptitudes } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/aptitudes.ts";
import { buildWizardSchoolSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/wizardSchools.ts";
import {
  type BaseGenerator,
  GENERATED_HEADER,
} from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { buildCoreSystemFeats } from "@/database/packages/dnd35-from-parser/tools/generator/code/coreSystemFeats.ts";
import {
  generateFavoredEnemyFeats,
  generateFeatSeeds,
  getFeatAptitudeSources,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/featFiles.ts";
import { compareNames, formatImport } from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/referenceLoader.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's feats: its feat reference's, the core rules' favored enemies, their index and the aptitudes. */
export function GeneratesFeats<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingFeats extends Base {
    /** Regenerate aptitudes.ts for a book from reference JSONs: its feats', and the core rules' system feats. */
    writeAptitudes(book: string) {
      const featRefPath = join(REFERENCE_DIR, book, "feats.json");
      const feats = [
        ...(existsSync(featRefPath) ? getFeatAptitudeSources(ReferenceLoader.load(featRefPath, "feat")) : []),
        ...(book === "srd"
          ? buildCoreSystemFeats(
              buildWizardSchoolSeeds(
                ReferenceLoader.load(join(REFERENCE_DIR, "srd", "wizardSchools.json"), "wizardSchool"),
              ),
            )
          : []),
      ];

      const aptitudes = collectAptitudes(feats, book);

      const aptLines: string[] = [];
      aptLines.push(...GENERATED_HEADER);
      aptLines.push(``);
      aptLines.push(`export const ALL_APTITUDES: string[] = [`);
      for (const apt of aptitudes) {
        aptLines.push(`  ${quote(apt)},`);
      }
      aptLines.push(`];`);
      aptLines.push(``);
      this.write(join(this.dir, book, "aptitudes.ts"), aptLines.join("\n"));
    }

    /** The core rules' favored enemy feats file: the core rules' alone. */
    writeFavoredEnemyFeats(book: string) {
      if (book !== "srd") return;

      this.write(join(this.dir, book, "feats", "favoredEnemy.ts"), generateFavoredEnemyFeats());
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
      const lines = [
        ...GENERATED_HEADER,
        `import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";`,
        ...featFiles.map(({ file, exports }) => formatImport(exports, `./${file.replace(".ts", "")}.ts`)),
        ...(hasClassFeats ? [formatImport(["ALL_CLASS_FEATS"], "./classes/index.ts")] : []),
        ``,
      ];
      const standalone = allFeatExports.map((name) => `...${name}`);
      // ALL_STANDALONE_FEATS: all non-class feats (empty array if none); ALL_FEATS: the class feats too
      lines.push(...this.listExport("ALL_STANDALONE_FEATS", "FeatSeed", standalone));
      lines.push(
        ...this.listExport("ALL_FEATS", "FeatSeed", hasClassFeats ? [...standalone, "...ALL_CLASS_FEATS"] : standalone),
      );

      const outPath = join(featDir, "index.ts");
      this.write(outPath, lines.join("\n"));
    }

    /** A feat reference's feats file (feats/feats.ts). */
    writeFeats(ref: FeatReference, book: string) {
      this.write(join(this.dir, book, "feats", "feats.ts"), generateFeatSeeds(ref));
    }
  }
  return GeneratingFeats;
}
