import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Requirements, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { copyEntityCustomizations, fetchEntityCustomizations } from "@/server/services/rulesets/cow.ts";
import { timingStorage } from "@/server/timing.ts";

test("nested customization reads are batched by depth, not sibling count", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const ruleset = await createSeededTestRuleset(session.userId);
  const counts: number[] = [];
  for (const width of [1, 12]) {
    const [source, target] = await Feats.createMany(db, ["Source", "Target"].map(name => ({ name: `${name} ${width}`, description: "Copy budget", rulesetId: ruleset.id })));
    const values = { target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" };
    const roots = await Modifiers.createMany(db, Array.from({ length: width }, () => ({ ...values, sourceId: source.id, sourceType: "feats" })));
    const children = await Modifiers.createMany(db, roots.map(root => ({ ...values, sourceId: root.id, sourceType: "modifiers" })));
    const leaves = await Modifiers.createMany(db, children.map(child => ({ ...values, sourceId: child.id, sourceType: "modifiers" })));
    await Requirements.createMany(db, leaves.map(leaf => ({ entityId: leaf.id, entityType: "modifiers", level: "1", chainingOperator: "and" })));
    const customizations = (await fetchEntityCustomizations(db, [source.id], "feats", "feats")).get(source.id)!;
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    await timingStorage.run(timing, () => copyEntityCustomizations(db, source.id, target.id, "feats", customizations));
    counts.push(timing.queryCount);
    const copiedRoots = await Modifiers.findManyBySource(db, { sourceIds: [target.id], sourceType: "feats" });
    const copiedChildren = await Modifiers.findManyBySource(db, { sourceIds: copiedRoots.map(m => m.id), sourceType: "modifiers" });
    const copiedLeaves = await Modifiers.findManyBySource(db, { sourceIds: copiedChildren.map(m => m.id), sourceType: "modifiers" });
    expect(copiedLeaves).toHaveLength(width);
    expect(await Requirements.findManyByEntity(db, { entityIds: copiedLeaves.map(m => m.id), entityType: "modifiers" })).toHaveLength(width);
  }
  console.info(`Nested copy queries: 1 sibling=${counts[0]}, 12 siblings=${counts[1]}`);
  // Each additional sibling needs three writes (two descendant inserts and
  // its requirements). Reads should stay constant at the same tree depth.
  expect(counts[1] - counts[0]).toBeLessThanOrEqual(3 * (12 - 1));
});
