import { expect, test } from "bun:test";

import { featsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Modifiers, Requirements } from "@/server/repositories/index.ts";
import { copyEntityCustomizations, fetchEntityCustomizations } from "@/server/services/rulesets/cow.ts";
import { timingStorage } from "@/server/timing.ts";
import { createSeededTestRuleset, insertRows, makeSession } from "@/tests/helpers.ts";

test("modifier and requirement copies stay batched as modifier count grows", async () => {
  const session = makeSession();
  const ruleset = await createSeededTestRuleset(session.userId);
  const counts: number[] = [];
  for (const width of [1, 12]) {
    const [source, target] = await insertRows(
      featsInRules,
      ["Source", "Target"].map((name) => ({
        name: `${name} ${width}`,
        description: "Copy budget",
        rulesetId: ruleset.id,
      })),
    );
    const values = { target: "abilities.strength.misc", value: "1", operator: "add", valueType: "number" };
    const roots = await Modifiers.createMany(
      db,
      Array.from({ length: width }, () => ({ ...values, sourceId: source.id, sourceType: "feats" })),
    );
    await Requirements.createMany(
      db,
      roots.map((modifier) => ({
        entityId: modifier.id,
        entityType: "modifiers",
        level: "1",
        chainingOperator: "and",
      })),
    );
    const customizations = (await fetchEntityCustomizations(db, [source.id], "feats", "feats")).get(source.id)!;
    const timing = {
      dbTimeMs: 0,
      queryCount: 0,
      activeQueries: 0,
      dbWallStart: 0,
      slowQueries: [],
      cacheHits: 0,
      cacheMisses: 0,
      dedupHits: 0,
      dedupMisses: 0,
    };
    await timingStorage.run(timing, () => copyEntityCustomizations(db, source.id, target.id, "feats", customizations));
    counts.push(timing.queryCount);
    const copiedRoots = await Modifiers.findManyBySource(db, { sourceIds: [target.id], sourceType: "feats" });
    expect(copiedRoots).toHaveLength(width);
    expect(
      await Requirements.findManyByEntity(db, { entityIds: copiedRoots.map((m) => m.id), entityType: "modifiers" }),
    ).toHaveLength(width);
  }
  expect(counts[1]).toBe(counts[0]);
});
