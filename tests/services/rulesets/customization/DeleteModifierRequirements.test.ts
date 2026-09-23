import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Requirements, Sessions } from "@/server/repositories/index.ts";
import { deleteModifiersWithCascade } from "@/server/services/rulesets/cow.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { timingStorage } from "@/server/timing.ts";

test("deleting a modifier removes its requirements and preserves a sibling", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { rulesetId: fork.id, name: "Modifier delete" });
  const values = { target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" };
  const [modifier, sibling] = await Modifiers.createMany(db, [1, 2].map(() => ({ ...values, sourceId: feat.id, sourceType: "feats" })));
  await Requirements.createMany(db, [modifier.id, sibling.id].flatMap(entityId => ["1", "1.1"].map(level => ({ entityId, entityType: "modifiers", level, chainingOperator: "and" }))));
  const deleted = await ModifiersMethods.deleteEntityModifier(session, fork.id, "feats", feat.id, modifier.id);
  expect(deleted.id).toBe(modifier.id);
  expect(await Modifiers.findOne(db, { id: modifier.id })).toBeUndefined();
  expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toHaveLength(0);
  expect(await Modifiers.findOne(db, { id: sibling.id })).toEqual(sibling);
  expect(await Requirements.findManyByEntity(db, { entityIds: [sibling.id], entityType: "modifiers" })).toHaveLength(2);
});

test("modifier deletion stays batched as modifier count grows", async () => {
  const counts: number[] = [];
  for (const width of [1, 40]) {
    const modifiers = await Modifiers.createMany(db, Array.from({ length: width }, () => ({ sourceId: crypto.randomUUID(), sourceType: "feats", target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" })));
    const ids = modifiers.map(row => row.id);
    await Requirements.createMany(db, ids.map(entityId => ({ entityId, entityType: "modifiers", level: "1", chainingOperator: "and" })));
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    const deleted = await timingStorage.run(timing, () => deleteModifiersWithCascade(db, { ids }));
    counts.push(timing.queryCount);
    expect(deleted).toHaveLength(width);
    for (const id of ids) expect(await Modifiers.findOne(db, { id })).toBeUndefined();
    expect(await Requirements.findManyByEntity(db, { entityIds: ids, entityType: "modifiers" })).toHaveLength(0);
  }
  expect(counts[1]).toBe(counts[0]);
});
