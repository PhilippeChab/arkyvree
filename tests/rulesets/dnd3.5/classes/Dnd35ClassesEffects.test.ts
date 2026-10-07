import { describe, expect, test } from "bun:test";

import { klassesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { Dnd35ClassesEffects } from "@/server/rulesets/dnd3.5/classes/Dnd35ClassesEffects.ts";
import { Dnd35ClassesRules } from "@/server/rulesets/dnd3.5/classes/Dnd35ClassesRules.ts";
import { writeProperties } from "@/server/services/rulesets/effectWrites.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

async function createClass() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [klass] = await insertRows(klassesInRules, [{ name: "Probe Class", rulesetId: ruleset.id, hd: 8 }]);
  return klass;
}

async function readClass(klassId: string) {
  return await Properties.findMany(db, { entityIds: [klassId], entityType: "klasses" });
}

describe("A class's effects", () => {
  test("store its fields as its properties, in place of those they stored, and keep its others", async () => {
    const klass = await createClass();
    await Properties.createMany(db, [
      { entityId: klass.id, entityType: "klasses", type: "SOMETHING_ELSE", value: "1" },
    ]);
    const effects = new Dnd35ClassesEffects();
    const rules = new Dnd35ClassesRules();

    await writeProperties(db, effects.properties(klass.id, { bonusSpellAbilityId: "wisdom-id", casterType: "Divine" }));
    const stored = await readClass(klass.id);
    expect(rules.readProperties(stored)).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
    const ids = rules.getPropertyIds(stored);
    expect([ids.bonusSpellAbilityId, ids.casterType].every((id) => stored.some((p) => p.id === id))).toBe(true);

    await writeProperties(db, effects.properties(klass.id, { bonusSpellAbilityId: null, casterType: "Arcane" }));
    const properties = await readClass(klass.id);
    expect(rules.readProperties(properties)).toEqual({ bonusSpellAbilityId: null, casterType: "Arcane" });
    expect(properties.map((property) => property.type).toSorted()).toEqual(["KLASS_CASTER_TYPE", "SOMETHING_ELSE"]);
  });
});
