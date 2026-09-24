import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Requirements, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { copyEntityCustomizations, fetchEntityCustomizations } from "@/server/services/rulesets/cow.ts";
import { timingStorage } from "@/server/timing.ts";

test("modifier and requirement copies stay batched as modifier count grows", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const ruleset = await createSeededTestRuleset(session.userId);
  const counts: number[] = [];
  for (const width of [1, 12]) {
    const [source, target] = await Feats.createMany(db, ["Source", "Target"].map(name => ({ name: `${name} ${width}`, description: "Copy budget", rulesetId: ruleset.id })));
    const values = { target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" };
    const roots = await Modifiers.createMany(db, Array.from({ length: width }, () => ({ ...values, sourceId: source.id, sourceType: "feats" })));
    await Requirements.createMany(db, roots.map(modifier => ({ entityId: modifier.id, entityType: "modifiers", level: "1", chainingOperator: "and" })));
    const customizations = (await fetchEntityCustomizations(db, [source.id], "feats", "feats")).get(source.id)!;
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    await timingStorage.run(timing, () => copyEntityCustomizations(db, source.id, target.id, "feats", customizations));
    counts.push(timing.queryCount);
    const copiedRoots = await Modifiers.findManyBySource(db, { sourceIds: [target.id], sourceType: "feats" });
    expect(copiedRoots).toHaveLength(width);
    expect(await Requirements.findManyByEntity(db, { entityIds: copiedRoots.map(m => m.id), entityType: "modifiers" })).toHaveLength(width);
  }
  expect(counts[1]).toBe(counts[0]);
});
