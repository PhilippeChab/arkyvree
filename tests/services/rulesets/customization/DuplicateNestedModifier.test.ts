import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Requirements, Sessions } from "@/server/repositories/index.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

test("duplicating a modifier preserves its nested modifiers and their requirements", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const ruleset = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { name: "Nested duplicate", description: "QA", rulesetId: ruleset.id });
  const values = { target: "abilities.strength.misc", value: "2", operator: "add", valueType: "number" };
  const [root] = await Modifiers.create(db, { ...values, sourceId: feat.id, sourceType: "feats" });
  const [child] = await Modifiers.create(db, { ...values, sourceId: root.id, sourceType: "modifiers" });
  const [leaf] = await Modifiers.create(db, { ...values, sourceId: child.id, sourceType: "modifiers" });
  const [requirement] = await Requirements.create(db, {
    entityId: leaf.id, entityType: "modifiers", level: "1", chainingOperator: "and",
  });

  const duplicate = await ModifiersMethods.duplicateEntityModifier(session, ruleset.id, "feats", feat.id, root.id, values);
  const children = await Modifiers.findManyBySource(db, { sourceIds: [duplicate.id], sourceType: "modifiers" });
  expect(children).toHaveLength(1);
  expect(children[0].id).not.toBe(child.id);
  const leaves = await Modifiers.findManyBySource(db, { sourceIds: children.map(row => row.id), sourceType: "modifiers" });
  expect(leaves).toHaveLength(1);
  expect(leaves[0].id).not.toBe(leaf.id);
  const requirements = await Requirements.findManyByEntity(db, { entityIds: [leaves[0].id], entityType: "modifiers" });
  expect(requirements).toHaveLength(1);
  expect(requirements[0].id).not.toBe(requirement.id);
  expect(requirements[0].chainingOperator).toBe("and");
  expect(await Requirements.findManyByEntity(db, { entityIds: [leaf.id], entityType: "modifiers" })).toEqual([requirement]);
});
