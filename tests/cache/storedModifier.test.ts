import { expect, test } from "bun:test";
import { getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { timingStorage } from "@/server/timing.ts";

test("stored modifier reads preserve ownership without changing ordinary COW reads", async () => {
  const seed = await getSeedContext(db);
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const [modifier] = await Modifiers.findManyBySource(db, { sourceIds: [sourceId], sourceType: "feats" });
  expect(modifier).toBeDefined();
  const copy = await cowEntity(db, "feats", sourceId, fork.id, [seed.rulesetId]);

  await runWithRequestCache(() => withRulesetScope(db, fork.id, async () => {
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    await timingStorage.run(timing, async () => {
      const resolved = await Modifiers.findOne(db, { id: modifier.id });
      const stored = await Modifiers.findStoredOne(db, { id: modifier.id });
      expect(resolved?.sourceId).toBe(copy.id);
      expect(stored?.sourceId).toBe(sourceId);
      expect(stored?.id).toBe(modifier.id);
      expect(await Modifiers.findStoredOne(db, { id: modifier.id })).toBe(stored);
      expect(await Modifiers.findOne(db, { id: modifier.id })).toBe(resolved);
    });
    expect(timing.queryCount).toBe(2);
    expect(timing.dedupHits).toBe(2);
  }));
});
