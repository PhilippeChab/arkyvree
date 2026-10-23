import { describe, expect, test } from "bun:test";

import CustomizedEntity from "@/engine/core/customizations/CustomizedEntity.ts";
import type { Feat, Item, Klass, KlassLevel, Power, Race } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers } from "@/server/repositories/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

describe("CustomizedEntity", () => {
  test("names the entity of each type, as its ruleset's view has it", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const rulesetId = ruleset.id;
    const [feat] = await Entities.create<Feat>(db, "feats", { rulesetId, name: "Test Feat" });
    const [item] = await Entities.create<Item>(db, "items", { rulesetId, name: "Test Item" });
    const [power] = await Entities.create<Power>(db, "powers", { rulesetId, name: "Test Power" });
    const [race] = await Entities.create<Race>(db, "races", {
      rulesetId,
      name: "Test Race",
      size: "Medium",
      baseSpeed: 30,
    });
    const [klass] = await Entities.create<Klass>(db, "klasses", { rulesetId, name: "Test Class", hd: 10 });
    const [klassLevel] = await Entities.create<KlassLevel>(db, "klass_levels", { klassId: klass.id, level: 1 });
    const [modifier] = await Modifiers.create(db, {
      sourceId: feat.id,
      sourceType: "feats",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });

    const entities: [string, string][] = [
      [feat.id, "feats"],
      [item.id, "items"],
      [power.id, "powers"],
      [race.id, "races"],
      [klass.id, "klasses"],
      [klassLevel.id, "klass_levels"],
      [modifier.id, "modifiers"],
    ];
    const names = await withRulesetScope(db, rulesetId, async (scope) =>
      entities.map(([id, type]) => CustomizedEntity.find(scope, type, id).name),
    );
    expect(names).toEqual([
      "Test Feat",
      "Test Item",
      "Test Power",
      "Test Race",
      "Test Class",
      "Level 1",
      "combat.bab add 1",
    ]);
  });

  test("refuses a missing entity, a type no customization is made on, and one outside the ruleset", async () => {
    const { ruleset: mine } = await createTestUserAndRuleset();
    const { ruleset: theirs } = await createTestUserAndRuleset();
    const [feat] = await Entities.create<Feat>(db, "feats", { rulesetId: theirs.id, name: "Their Feat" });

    await withRulesetScope(db, mine.id, async (scope) => {
      for (const type of ["feats", "items", "powers", "races", "klasses", "klass_levels", "modifiers", "characters"])
        expect(() => CustomizedEntity.find(scope, type, NIL_UUID)).toThrow(`${type} not supported`);
      expect(() => CustomizedEntity.find(scope, "feats", feat.id)).toThrow("feats not supported");
    });
    await withRulesetScope(db, theirs.id, async (scope) => {
      expect(CustomizedEntity.find(scope, "feats", feat.id).name).toBe("Their Feat");
    });
  });
});
