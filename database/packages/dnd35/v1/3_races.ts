import { eq } from "drizzle-orm";
import {
  modifiersInCustomization,
  racesInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { ALL_RACES } from "@/database/packages/dnd35/v1/races/data.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const insertedRaces = await db.insert(racesInRules).values(
    ALL_RACES.map((r) => ({
      rulesetId: ruleset.id,
      name: r.name,
      description: r.description,
      size: r.size,
      baseSpeed: r.baseSpeed,
    })),
  ).returning({ id: racesInRules.id, name: racesInRules.name });

  const raceMap = Object.fromEntries(insertedRaces.map((r) => [r.name, r.id]));

  const modifiers: {
    sourceId: string;
    sourceType: string;
    target: string;
    operator: string;
    value: string;
    valueType: string;
  }[] = [];

  for (const race of ALL_RACES) {
    if (!race.modifiers?.length) continue;
    for (const m of race.modifiers) {
      modifiers.push({
        sourceId: raceMap[race.name],
        sourceType: "races",
        ...m,
      });
    }
  }

  if (modifiers.length > 0) {
    await db.insert(modifiersInCustomization).values(modifiers);
  }
}
