import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Properties, Requirements, Sessions } from "@/server/repositories/index.ts";
import { deleteModifiersWithCascade } from "@/server/services/rulesets/cow.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { timingStorage } from "@/server/timing.ts";

test("deleting a modifier removes descendants and their customizations, preserving a sibling", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { rulesetId: fork.id, name: "Nested delete" });
  const values = { target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" };
  const [root, sibling] = await Modifiers.createMany(db, [1, 2].map(() => ({ ...values, sourceId: feat.id, sourceType: "feats" })));
  const [child] = await Modifiers.create(db, { ...values, sourceId: root.id, sourceType: "modifiers" });
  const [leaf] = await Modifiers.create(db, { ...values, sourceId: child.id, sourceType: "modifiers" });
  const ids = [root.id, child.id, leaf.id];
  await Requirements.createMany(db, [...ids, sibling.id].map(entityId => ({ entityId, entityType: "modifiers", level: "1", chainingOperator: "and" })));
  await Properties.createMany(db, ids.map(entityId => ({ entityId, entityType: "modifiers", type: "QA", value: "1" })));
  const deleted = await ModifiersMethods.deleteEntityModifier(session, fork.id, "feats", feat.id, root.id);
  expect(deleted.id).toBe(root.id);
  for (const id of ids) expect(await Modifiers.findOne(db, { id })).toBeUndefined();
  expect(await Requirements.findManyByEntity(db, { entityIds: ids, entityType: "modifiers" })).toHaveLength(0);
  expect(await Properties.findManyByEntity(db, { entityIds: ids, entityType: "modifiers" })).toHaveLength(0);
  expect(await Modifiers.findOne(db, { id: sibling.id })).toEqual(sibling);
  expect(await Requirements.findManyByEntity(db, { entityIds: [sibling.id], entityType: "modifiers" })).toHaveLength(1);
});

test("tree deletion stays batched as depth and width grow and terminates on cycles", async () => {
  const counts: number[] = [];
  for (const width of [1, 40]) {
    const roots = await Modifiers.createMany(db, Array.from({ length: width }, () => ({ sourceId: crypto.randomUUID(), sourceType: "feats", target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" })));
    let parents = roots;
    const ids = roots.map(row => row.id);
    for (let depth = 0; depth < 5; depth++) {
      parents = await Modifiers.createMany(db, parents.map(row => ({ ...row, id: undefined, sourceId: row.id, sourceType: "modifiers" })));
      ids.push(...parents.map(row => row.id));
    }
    // A malformed cycle must not recurse forever. Roots are selected by id.
    await Modifiers.update(db, { sourceId: parents[0].id, sourceType: "modifiers" }, { id: roots[0].id });
    await Requirements.createMany(db, ids.map(entityId => ({ entityId, entityType: "modifiers", level: "1", chainingOperator: "and" })));
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    const deleted = await timingStorage.run(timing, () => deleteModifiersWithCascade(db, { ids: roots.map(row => row.id) }));
    counts.push(timing.queryCount);
    expect(deleted).toHaveLength(width);
    expect(await Modifiers.findManyBySource(db, { sourceIds: ids, sourceType: "modifiers" })).toHaveLength(0);
    expect(await Requirements.findManyByEntity(db, { entityIds: ids, entityType: "modifiers" })).toHaveLength(0);
  }
  expect(counts[1]).toBe(counts[0]);
});
