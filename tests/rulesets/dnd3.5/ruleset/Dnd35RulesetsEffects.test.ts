import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { Dnd35RulesetsEffects } from "@/server/rulesets/dnd3.5/ruleset/Dnd35RulesetsEffects.ts";
import { Dnd35RulesetsRules } from "@/server/rulesets/dnd3.5/ruleset/Dnd35RulesetsRules.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

async function readRuleset(rulesetId: string) {
  return await Properties.findMany(db, { entityIds: [rulesetId], entityType: "rulesets" });
}

describe("A ruleset's effects", () => {
  test("store its own fields as its properties, in place of those they stored, and keep its others", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    await Properties.createMany(db, [
      { entityId: ruleset.id, entityType: "rulesets", type: "SOMETHING_ELSE", value: "1" },
    ]);
    const { abilityMap } = await getSeedCtx();
    const effects = new Dnd35RulesetsEffects();
    const rules = new Dnd35RulesetsRules();

    await effects.syncProperties(db, ruleset.id, { skillPointAbilityId: abilityMap.Wisdom });
    expect(rules.readProperties(await readRuleset(ruleset.id))).toEqual({ skillPointAbilityId: abilityMap.Wisdom });

    await effects.syncProperties(db, ruleset.id, { skillPointAbilityId: null });
    expect((await readRuleset(ruleset.id)).map((property) => property.type)).toEqual(["SOMETHING_ELSE"]);
  });
});
