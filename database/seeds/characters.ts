import { RULESET_CONTENT } from "@/database/packages/registry.ts";
import type { Db } from "@/server/database/index.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";

import { seedCharacter } from "./seedCharacter.ts";
import { getSeedContext } from "./seedContext.ts";

/** Seeds the seed user's characters on each base rules' core rules (its row of the registry's `testCharacters`), in their order. */
export default async function seed(db: Db) {
  for (const baseRules of BASE_RULES_OPTIONS) {
    const ctx = await getSeedContext(db, baseRules);
    for (const character of RULESET_CONTENT[baseRules].testCharacters) await seedCharacter(db, ctx, character);
  }
}
