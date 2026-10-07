/** A class's feats file (feats/classes/<slug>.ts): the feats its features are, and the domains it picks from. */

import { buildClassDomainPickFeats } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/domainPicks.ts";
import { buildClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/featSeeds.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

import { CodeFile } from "./CodeFile.ts";
import { toConstName } from "./literals.ts";

/** A class's feats file: its own feats (`buildClassFeatSeeds`), and the domains it picks from (`buildClassDomainPickFeats`). */
export function generateClassFeatSeeds(ref: ClassReference): string {
  const file = new CodeFile();
  file.list(
    `${toConstName(ref.raw.name)}_CLASS_FEATS`,
    "FeatSeed",
    [...buildClassFeatSeeds(ref), ...buildClassDomainPickFeats(ref)].flatMap((feat) => file.feat(feat)),
  );
  return file.code();
}
