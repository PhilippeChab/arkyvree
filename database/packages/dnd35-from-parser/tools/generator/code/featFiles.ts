/** A feat reference's feats file, the core rules' favored enemies' file, and a feat's checks of a family. */

import { FeatsFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/FeatsFile.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import { buildReferenceFeats, resolveFamilyChecks } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import TemplateFamilies from "@/database/packages/dnd35-from-parser/tools/seeds/TemplateFamilies.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";

/** What opens a feats file: the seed type's import. */
const FEAT_SEED_IMPORT = `import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";`;

/** The core rules' favored enemy feats file (favoredEnemy.ts). */
export function generateFavoredEnemyFeats(): string {
  const file = new FeatsFile();
  file.emitSystemFeats("favoredEnemy.ts");
  return file.code([FEAT_SEED_IMPORT]);
}

/** A feat reference's FeatSeed[] file. */
export function generateFeatSeeds(ref: FeatReference): string {
  const { byType, templates, templateNames } = buildReferenceFeats(ref);
  const families = TemplateFamilies.requirable(ref._meta.book, templateNames);
  const file = new FeatsFile();

  for (const [type, feats] of byType) {
    file.lines.push(`export const ${type.toUpperCase().replace(/\s+/g, "_")}_FEATS: FeatSeed[] = [`);
    for (const feat of feats) {
      file.lines.push(...file.feat({ ...feat, requirements: resolveFamilyChecks(feat.requirements ?? [], families) }));
    }
    file.lines.push(`];`, "");
  }

  for (const family of templates) file.emitTemplate(family, families);

  // System feats are only generated for the SRD — other books reuse them
  if (ref._meta.book === CORE_BOOK) {
    file.emitSystemFeats("feats.ts");
  }
  return file.code([FEAT_SEED_IMPORT]);
}
