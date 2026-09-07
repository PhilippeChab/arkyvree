import { eq } from "drizzle-orm";
import {
  aptitudesInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/srd/aptitudes.ts";

export { ALL_APTITUDES };

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  await db.insert(aptitudesInRules).values(
    ALL_APTITUDES.map((name) => ({ rulesetId: ruleset.id, name })),
  );
}
