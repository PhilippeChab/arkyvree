import { afterEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { timingStorage } from "@/server/timing.ts";
import { getOrBuildCowData, getOrFetchRulesetRawData, getOrFetchTargetPathsAndLabels, invalidateAll, invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import DependentCache from "@/server/cache/DependentCache.ts";
import { TargetPathsMethods } from "@/server/services/rulesets/customization/TargetPathsService.ts";

afterEach(invalidateAll);

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  return { edited: await createSeededTestRuleset(session.userId), unrelated: await createSeededTestRuleset(session.userId) };
}

function counters() {
  return { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
}

for (const phase of ["pending", "cached"] as const) {
  test(`editing A preserves ${phase} raw/COW/path reads for B with zero extra SQL`, async () => {
    const { edited, unrelated } = await setup();
    invalidateAll();
    const paths = async () => ({ paths: [], segmentLabels: { name: (await Rulesets.findOne(db, { id: unrelated.id }))!.name } });
    const read = () => Promise.all([
      getOrFetchRulesetRawData(unrelated.id),
      getOrBuildCowData(unrelated),
      getOrFetchTargetPathsAndLabels(unrelated.id, "modifier", paths, unrelated.ancestorRulesetIds),
    ]);
    const pending = read();
    if (phase === "cached") await pending;
    invalidateRuleset(edited.id);
    const first = await pending;
    const timing = counters();
    const next = await timingStorage.run(timing, read);
    for (let i = 0; i < first.length; i++) expect(next[i]).toBe(first[i]);
    expect(timing.queryCount).toBe(0);
  });
}

test("target-path service invalidates extension subscribers but retains an unrelated fork", async () => {
  const { edited, unrelated } = await setup();
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const host = await createSeededTestRuleset(session.userId);
  await Rulesets.update(db, { kind: "extension", status: "Published" }, { id: edited.id });
  await Rulesets.update(db, { extensionRulesetIds: [edited.id] }, { id: host.id });
  const [feat] = await Feats.create(db, { rulesetId: edited.id, name: "Performance Marker", description: "Before" });
  invalidateAll();
  const before = await TargetPathsMethods.getTargetPathsWithLabels(host.id, "requirement");
  const untouched = await TargetPathsMethods.getTargetPathsWithLabels(unrelated.id, "requirement");
  expect(before.paths.some(path => path.path === "feats.performancemarker.possessed")).toBe(true);
  await Feats.update(db, { name: "Updated Marker" }, { id: feat.id });
  invalidateRuleset(edited.id);
  const next = await TargetPathsMethods.getTargetPathsWithLabels(host.id, "requirement");
  expect(next.paths.some(path => path.path === "feats.performancemarker.possessed")).toBe(false);
  expect(next.paths.some(path => path.path === "feats.updatedmarker.possessed")).toBe(true);
  expect(await TargetPathsMethods.getTargetPathsWithLabels(unrelated.id, "requirement")).toBe(untouched);
});

for (const invalidate of ["dependency", "all"] as const) {
  test(`late ${invalidate} completion cannot replace a newer in-flight read`, async () => {
    const { edited } = await setup();
    const cache = new DependentCache<NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>>();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const freshStarted = Promise.withResolvers<void>();
    const freshRelease = Promise.withResolvers<void>();
    const read = async () => ({ data: (await Rulesets.findOne(db, { id: edited.id }))! });
    const old = cache.getOrFetch(edited.id, [edited.id], async () => {
      const value = await read(); started.resolve(); await release.promise; return value;
    });
    await started.promise;
    if (invalidate === "all") cache.invalidateAll(); else cache.invalidate(edited.id);
    await Rulesets.update(db, { description: "Fresh" }, { id: edited.id });
    const fresh = cache.getOrFetch(edited.id, [edited.id], async () => {
      const value = await read(); freshStarted.resolve(); await freshRelease.promise; return value;
    });
    try {
      await freshStarted.promise;
      release.resolve(); await old;
      const joined = cache.getOrFetch(edited.id, [edited.id], read);
      freshRelease.resolve();
      expect(await joined).toBe(await fresh);
      expect((await joined).description).toBe("Fresh");
      expect(await cache.getOrFetch(edited.id, [edited.id], read)).toBe(await fresh);
    } finally {
      release.resolve(); freshRelease.resolve(); await Promise.all([old, fresh]); cache.invalidateAll();
    }
  });
}
