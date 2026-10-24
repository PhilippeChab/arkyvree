import { RULESET_CONTENT } from "@/database/packages/registry.ts";
import type { Db } from "@/drizzle/database.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";

/** Seeds the seed user's characters on each base rules' core rules (its row of the registry's `seedTestCharacters`). */
export default async function seed(db: Db) {
  for (const baseRules of BASE_RULES_OPTIONS) await RULESET_CONTENT[baseRules].seedTestCharacters(db);
}
