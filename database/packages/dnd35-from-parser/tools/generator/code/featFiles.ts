/** A feat reference's feats file. */

import { resolveFamilyChecks } from "@/database/packages/dnd35-from-parser/tools/seeds/feats.ts";
import Library from "@/database/packages/dnd35-from-parser/tools/seeds/Library.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";

import { FeatsFile, getFeatTypeListName } from "./FeatsFile.ts";

/** A feat reference's FeatSeed[] file: a list per feat type, and one per template family. */
export function generateFeatSeeds(ref: FeatReference): string {
  const book = Library.book(ref._meta.book);
  const { byType, templates } = book.featSeeds(ref);
  const families = book.requirableFamilies();
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
