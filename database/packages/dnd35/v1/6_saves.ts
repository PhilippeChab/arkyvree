import { and, eq, isNull } from "drizzle-orm";
import { abilitiesInRules, rulesetsInRules, savesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const abilities = await db
    .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
    .from(abilitiesInRules)
    .where(
      and(
        eq(abilitiesInRules.rulesetId, ruleset.id),
        isNull(abilitiesInRules.deletedAt),
      ),
    );

  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));

  await db.insert(savesInRules).values([
    { rulesetId: ruleset.id, name: "Fortitude", description: "Represents physical toughness and resistance to physical threats like poison, disease, and fatigue", abilityId: abilityMap["Constitution"] },
    { rulesetId: ruleset.id, name: "Reflex", description: "Represents agility and the ability to dodge area attacks like fireballs and dragon breath", abilityId: abilityMap["Dexterity"] },
    { rulesetId: ruleset.id, name: "Will", description: "Represents mental resilience and resistance to mind-affecting spells and effects", abilityId: abilityMap["Wisdom"] },
  ]);
}
