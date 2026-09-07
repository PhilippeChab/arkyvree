import {
  aptitudesInRules,
  rulesetsInRules,
  savesInRules,
} from "@/drizzle/schema.ts";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedPowers } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/srd/spells/index.ts";

export async function seedAllPowers(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const [aptitudes, saves] = await Promise.all([
    db
      .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
      .from(aptitudesInRules)
      .where(eq(aptitudesInRules.rulesetId, ruleset.id)),
    db
      .select({ id: savesInRules.id, name: savesInRules.name })
      .from(savesInRules)
      .where(eq(savesInRules.rulesetId, ruleset.id)),
  ]);

  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));
  const saveMap = Object.fromEntries(saves.map((s) => [s.name, s.id]));

  await seedPowers(db, ruleset.id, ALL_SPELLS, { aptMap, saveMap });
}
