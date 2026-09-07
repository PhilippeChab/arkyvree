import { and, eq, isNull } from "drizzle-orm";
import { abilitiesInRules, propertiesInCustomization, rulesetsInRules } from "@/drizzle/schema.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  await db.insert(abilitiesInRules).values([
    { rulesetId: ruleset.id, name: "Strength", description: "Measures physical power and carrying capacity" },
    { rulesetId: ruleset.id, name: "Dexterity", description: "Measures agility, reflexes, and balance" },
    { rulesetId: ruleset.id, name: "Constitution", description: "Measures health, stamina, and vital force" },
    { rulesetId: ruleset.id, name: "Intelligence", description: "Measures reasoning and memory" },
    { rulesetId: ruleset.id, name: "Wisdom", description: "Measures perception and insight" },
    { rulesetId: ruleset.id, name: "Charisma", description: "Measures force of personality and leadership" },
  ]);

  const [intelligence] = await db
    .select({ id: abilitiesInRules.id })
    .from(abilitiesInRules)
    .where(
      and(
        eq(abilitiesInRules.name, "Intelligence"),
        eq(abilitiesInRules.rulesetId, ruleset.id),
        isNull(abilitiesInRules.deletedAt),
      ),
    );

  await db.insert(propertiesInCustomization).values({
    entityId: ruleset.id,
    entityType: "rulesets",
    type: RULESET_SKILL_POINT_ABILITY_ID,
    value: intelligence.id,
  });
}
