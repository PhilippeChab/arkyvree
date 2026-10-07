import { describe, expect, test } from "bun:test";

import { powersInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { Dnd35PowersEffects } from "@/server/rulesets/dnd3.5/powers/Dnd35PowersEffects.ts";
import { Dnd35PowersRules } from "@/server/rulesets/dnd3.5/powers/Dnd35PowersRules.ts";
import { writeProperties } from "@/server/services/rulesets/effectWrites.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

async function createPower() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [power] = await insertRows(powersInRules, [{ name: "Probe Spell", rulesetId: ruleset.id }]);
  return power;
}

async function readPower(powerId: string) {
  return await Properties.findMany(db, { entityIds: [powerId], entityType: "powers" });
}

describe("A power's effects", () => {
  test("store its fields as its properties, in place of those they stored, and keep its others", async () => {
    const power = await createPower();
    await Properties.createMany(db, [{ entityId: power.id, entityType: "powers", type: "SOMETHING_ELSE", value: "1" }]);
    const effects = new Dnd35PowersEffects();
    const rules = new Dnd35PowersRules();
    const fields = { components: ["S", "V"], descriptors: ["Fire"], school: "Evocation", target: "One creature" };

    await writeProperties(db, effects.properties(power.id, fields));
    expect(rules.readProperties(await readPower(power.id))).toEqual(fields);

    await writeProperties(db, effects.properties(power.id, { components: [], descriptors: [], school: "Illusion" }));
    expect(rules.readProperties(await readPower(power.id))).toEqual({
      components: [],
      descriptors: [],
      school: "Illusion",
    });

    await writeProperties(db, effects.properties(power.id, { duration: "1 round" }));
    expect((await readPower(power.id)).map((property) => property.type)).toEqual(["SOMETHING_ELSE"]);
  });
});
