import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Requirements, Sessions } from "@/server/repositories/index.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

test("duplicating a modifier preserves its requirements without changing the original", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const ruleset = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { name: "Modifier duplicate", description: "QA", rulesetId: ruleset.id });
  const values = { target: "abilities.strength.misc", value: "2", operator: "add", valueType: "number" };
  const [root] = await Modifiers.create(db, { ...values, sourceId: feat.id, sourceType: "feats" });
  const [requirement] = await Requirements.create(db, {
    entityId: root.id, entityType: "modifiers", level: "1", chainingOperator: "and",
  });

  const duplicate = await ModifiersMethods.duplicateEntityModifier(session, ruleset.id, "feats", feat.id, root.id, values);
  const requirements = await Requirements.findManyByEntity(db, { entityIds: [duplicate.id], entityType: "modifiers" });
  expect(requirements).toHaveLength(1);
  expect(requirements[0].id).not.toBe(requirement.id);
  expect(requirements[0].chainingOperator).toBe("and");
  expect(await Requirements.findManyByEntity(db, { entityIds: [root.id], entityType: "modifiers" })).toEqual([requirement]);
});
