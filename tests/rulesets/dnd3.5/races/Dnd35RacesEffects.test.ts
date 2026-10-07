import { describe, expect, test } from "bun:test";

import { racesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { Dnd35RacesEffects } from "@/server/rulesets/dnd3.5/races/Dnd35RacesEffects.ts";
import { Dnd35RacesRules } from "@/server/rulesets/dnd3.5/races/Dnd35RacesRules.ts";
import { writeProperties } from "@/server/services/rulesets/effectWrites.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

async function createRace() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [race] = await insertRows(racesInRules, [
    { name: "Probe Race", rulesetId: ruleset.id, size: "Medium", baseSpeed: 30 },
  ]);
  return race;
}

async function readRace(raceId: string) {
  return await Properties.findMany(db, { entityIds: [raceId], entityType: "races" });
}

describe("A race's effects", () => {
  test("store its fields as its properties, in place of those they stored, and keep its others", async () => {
    const race = await createRace();
    await Properties.createMany(db, [{ entityId: race.id, entityType: "races", type: "SOMETHING_ELSE", value: "1" }]);
    const effects = new Dnd35RacesEffects();
    const rules = new Dnd35RacesRules();

    await writeProperties(db, effects.properties(race.id, { quadruped: true, speedIgnoresEncumbrance: true }));
    expect(rules.readProperties(await readRace(race.id))).toEqual({ quadruped: true, speedIgnoresEncumbrance: true });

    await writeProperties(db, effects.properties(race.id, { quadruped: false, speedIgnoresEncumbrance: true }));
    const properties = await readRace(race.id);
    expect(rules.readProperties(properties)).toEqual({ quadruped: false, speedIgnoresEncumbrance: true });
    expect(properties.map((property) => property.type).toSorted()).toEqual([
      "RACE_SPEED_IGNORES_ENCUMBRANCE",
      "SOMETHING_ELSE",
    ]);
  });
});
