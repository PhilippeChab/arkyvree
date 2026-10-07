/** A feat reference's feats file. */

import {
  FeatsFile,
  getFeatTypeListName,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/FeatsFile.ts";
import { buildReferenceFeats, resolveFamilyChecks } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import TemplateFamilies from "@/database/packages/dnd35-from-parser/tools/seeds/TemplateFamilies.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";

/** A feat reference's FeatSeed[] file: a list per feat type, and one per template family. */
export function generateFeatSeeds(ref: FeatReference): string {
  const { byType, templates, templateNames } = buildReferenceFeats(ref);
  const families = TemplateFamilies.requirable(ref._meta.book, templateNames);
  const file = new FeatsFile();

  for (const [type, feats] of byType) {
    file.list(
      getFeatTypeListName(type),
      "FeatSeed",
      feats.flatMap((feat) =>
        file.feat({ ...feat, requirements: resolveFamilyChecks(feat.requirements ?? [], families) }),
      ),
    );
  }

  for (const family of templates) file.emitTemplate(family, families);

  return file.code();
}
