import { eq } from "drizzle-orm";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedClass } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const saves = await db
    .select({ id: savesInRules.id, name: savesInRules.name })
    .from(savesInRules)
    .where(eq(savesInRules.rulesetId, ruleset.id));

  const skills = await db
    .select({ id: skillsInRules.id, name: skillsInRules.name })
    .from(skillsInRules)
    .where(eq(skillsInRules.rulesetId, ruleset.id));

  const feats = await db
    .select({ id: featsInRules.id, name: featsInRules.name })
    .from(featsInRules)
    .where(eq(featsInRules.rulesetId, ruleset.id));

  const aptitudes = await db
    .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
    .from(aptitudesInRules)
    .where(eq(aptitudesInRules.rulesetId, ruleset.id));

  const abilities = await db
    .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
    .from(abilitiesInRules)
    .where(eq(abilitiesInRules.rulesetId, ruleset.id));

  const ctx = {
    rulesetId: ruleset.id,
    saveMap: Object.fromEntries(saves.map((s) => [s.name, s.id])),
    skillMap: Object.fromEntries(skills.map((s) => [s.name, s.id])),
    featMap: Object.fromEntries(feats.map((f) => [f.name, f.id])),
    aptMap: Object.fromEntries(aptitudes.map((a) => [a.name, a.id])),
    abilityMap: Object.fromEntries(abilities.map((a) => [a.name, a.id])),
  };

  for (const classDef of ALL_CLASSES) {
    await seedClass(db, ctx.rulesetId, classDef, ctx);
  }
}
