import { DND5_CORE_PACKAGE } from "@/content/dnd5/packages/core.ts";
import type { Db } from "@/drizzle/database.ts";

import { RulesetSeeder } from "./RulesetSeeder.ts";

/**
 * The D&D 5th Edition core rules' v2: a weapon's proficiency, an armor's and the Shield's training are the item's
 * requirements, Martial Arts' Dexterity a feat's field, as 3.5's proficiency and Weapon Finesse are, in place of the
 * feats' modifiers that set them (`RulesetSeeder.updateCore`).
 */
export async function addProficiencyRequirements(db: Db) {
  const rulesetId = await RulesetSeeder.findCoreRulesetId(db, DND5_CORE_PACKAGE, "The weapons' proficiency");
  const seeder = new RulesetSeeder(db, await RulesetSeeder.loadContext(db, rulesetId));
  await seeder.updateCore(DND5_CORE_PACKAGE.content);
}
