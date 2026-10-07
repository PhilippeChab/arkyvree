import { describe, expect, test } from "bun:test";

import { featsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { Dnd35FeatsEffects } from "@/server/rulesets/dnd3.5/feats/Dnd35FeatsEffects.ts";
import { Dnd35FeatsRules } from "@/server/rulesets/dnd3.5/feats/Dnd35FeatsRules.ts";
import { NO_FEAT_FIELDS } from "@/server/rulesets/dnd3.5/feats/featFields.ts";
import { writeProperties } from "@/server/services/rulesets/effectWrites.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

async function createFeat() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [feat] = await insertRows(featsInRules, [{ name: "Probe Feat", rulesetId: ruleset.id }]);
  return feat;
}

async function readFeat(featId: string) {
  return await Properties.findMany(db, { entityIds: [featId], entityType: "feats" });
}

describe("A feat's effects", () => {
  test("store its fields as its properties, in place of those they stored, and keep its others", async () => {
    const feat = await createFeat();
    await Properties.createMany(db, [{ entityId: feat.id, entityType: "feats", type: "SOMETHING_ELSE", value: "1" }]);
    const effects = new Dnd35FeatsEffects();
    const rules = new Dnd35FeatsRules();
    const fields = { ...NO_FEAT_FIELDS, families: ["Fighter Bonus", "Weapon Focus"], weaponFinesse: true };

    await writeProperties(db, effects.properties(feat.id, fields));
    expect(rules.readProperties(await readFeat(feat.id))).toEqual(fields);

    await writeProperties(db, effects.properties(feat.id, { ...NO_FEAT_FIELDS, prohibitedSchools: ["Evocation"] }));
    const properties = await readFeat(feat.id);
    expect(rules.readProperties(properties)).toEqual({ ...NO_FEAT_FIELDS, prohibitedSchools: ["Evocation"] });
    expect(properties.map((property) => property.type).toSorted()).toEqual([
      "SOMETHING_ELSE",
      "WIZARD_PROHIBITED_SCHOOL",
    ]);
  });
});
