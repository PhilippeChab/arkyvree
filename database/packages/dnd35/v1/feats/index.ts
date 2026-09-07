import { eq } from "drizzle-orm";
import {
  aptitudesInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedFeats } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_FEATS } from "@/database/packages/dnd35-from-parser/generated/srd/feats/index.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const aptitudes = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));

  const apt = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));

  await seedFeats(db, ruleset.id, apt, ALL_FEATS);
}
