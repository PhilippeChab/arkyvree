import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Requirements, Sessions } from "@/server/repositories/index.ts";
import { copyEntityCustomizationsToMany, fetchEntityCustomizations } from "@/server/services/rulesets/cow.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const ruleset = await createSeededTestRuleset(session.userId);
  const [source, ...targets] = await Feats.createMany(db, ["Source", "Target A", "Target B"].map(name => ({ name: `Copy ${name}`, rulesetId: ruleset.id })));
  const [modifier] = await Modifiers.createMany(db, [{ target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number", sourceId: source.id, sourceType: "feats" }]);
  await Requirements.createMany(db, [{ entityId: modifier.id, entityType: "modifiers", level: "1", target: "combat.bab", operator: "greater_than_or_equal", value: "1", valueType: "number" }]);
  const customizations = (await fetchEntityCustomizations(db, [source.id], "feats", "feats")).get(source.id)!;
  return { source, targets, modifier, customizations };
}

test("each target's copied modifier requirement belongs to that target's modifier", async () => {
  const { targets, customizations } = await setup();
  await copyEntityCustomizationsToMany(db, targets.map(t => t.id), "feats", customizations);
  for (const target of targets) {
    const [modifier] = await Modifiers.findManyBySource(db, { sourceIds: [target.id], sourceType: "feats" });
    expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toHaveLength(1);
  }
});

test("copied-id recording is limited to a single target", async () => {
  const { targets, customizations } = await setup();
  await expect(copyEntityCustomizationsToMany(db, targets.map(t => t.id), "feats", customizations, new Map()))
    .rejects.toThrow("copy to a single target");
});

test("a modifier requirement is never copied onto the source's own modifier", async () => {
  const { targets, modifier, customizations } = await setup();
  await expect(copyEntityCustomizationsToMany(db, [targets[0].id], "feats", { ...customizations, modifiers: [] }))
    .rejects.toThrow("outside the copied set");
  expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toHaveLength(1);
});

test("modifiers are not silently dropped for entity types that cannot own them", async () => {
  const { targets, customizations } = await setup();
  await expect(copyEntityCustomizationsToMany(db, [targets[0].id], "skills", customizations))
    .rejects.toThrow("Cannot copy modifiers onto skills");
});
