import { afterEach, expect, test } from "bun:test";

import MemoryCache from "@/server/cache/MemoryCache.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Feats, Rulesets } from "@/server/repositories/index.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

afterEach(() => {
  RulesetViews.invalidateAll();
  MemoryCache.setEnabled(true);
});

test("extension COW invalidates the warm subscriber mapping", async () => {
  RulesetViews.invalidateAll();
  const session = makeSession();
  const extension = await createSeededTestRuleset(session.userId);
  await Rulesets.update(db, { kind: "extension", status: "Published" }, { id: extension.id });
  const host = await createSeededTestRuleset(session.userId);
  await Rulesets.update(db, { extensionRulesetIds: [extension.id] }, { id: host.id });
  const updatedHost = (await Rulesets.findOne(db, { id: host.id }))!;
  const source = (await Feats.findOne(db, { rulesetId: extension.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
  const before = await RulesetViews.getCowData(updatedHost);
  await RulesetViews.getData(updatedHost);
  const copy = await copyEntity(db, "feats", source.id, extension);
  await Feats.update(db, { description: "Updated extension feat" }, { id: copy.id });
  RulesetViews.invalidate(extension.id);
  const after = await RulesetViews.getCowData(updatedHost);
  expect(after).not.toBe(before);
  expect(after.resolve(source.id)).toBe(copy.id);
  const data = await RulesetViews.getData(updatedHost);
  expect(data.featsById.get(copy.id)?.description).toBe("Updated extension feat");
  expect(data.feats.some((f) => f.id === source.id)).toBe(false);
});

test("worker cache mode reads changes between builds without web invalidation", async () => {
  MemoryCache.setEnabled(false);
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { name: "Worker freshness", description: "Before", rulesetId: fork.id });
  const first = await RulesetViews.getData(fork);
  expect(first.featsById.get(feat.id)?.description).toBe("Before");
  await Feats.update(db, { description: "After" }, { id: feat.id });
  const next = await RulesetViews.getData(fork);
  expect(next.featsById.get(feat.id)?.description).toBe("After");
});

test("disabled caches do not coalesce raw reads across worker jobs", async () => {
  MemoryCache.setEnabled(false);
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const [first, second] = await Promise.all([RulesetViews.getRawData(fork.id), RulesetViews.getRawData(fork.id)]);
  expect(first).not.toBe(second);
});

test("a nested base scope clears the fork mapping and restores it afterward", async () => {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const source = (await Feats.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
  const copy = await copyEntity(db, "feats", source.id, fork);
  RulesetViews.invalidateAll();
  await withRulesetScope(db, fork.id, async () => {
    expect((await Feats.findOne(db, { id: source.id }))?.id).toBe(copy.id);
    await withRulesetScope(db, source.rulesetId, async () => {
      expect((await Feats.findOne(db, { id: source.id }))?.id).toBe(source.id);
    });
    expect((await Feats.findOne(db, { id: source.id }))?.id).toBe(copy.id);
  });
});

for (const invalidation of ["ruleset", "all"] as const) {
  test(`${invalidation} invalidation prevents a late target-path read from replacing fresh data`, async () => {
    const session = makeSession();
    const fork = await createSeededTestRuleset(session.userId);
    const [feat] = await Feats.create(db, { name: "Path race", description: "Before", rulesetId: fork.id });
    const read = async () => ({
      paths: [],
      segmentLabels: { feat: (await Feats.findOne(db, { id: feat.id }))!.description! },
    });
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const old = RulesetViews.getTargetPaths(fork, "modifier", async () => {
      const data = await read();
      started.resolve();
      await release.promise;
      return data;
    });
    await started.promise;
    try {
      await Feats.update(db, { description: "After" }, { id: feat.id });
      if (invalidation === "ruleset") RulesetViews.invalidate(fork.id);
      else RulesetViews.invalidateAll();
      const fresh = await RulesetViews.getTargetPaths(fork, "modifier", read);
      expect(fresh.segmentLabels.feat).toBe("After");
    } finally {
      release.resolve();
      await old;
    }
    expect((await RulesetViews.getTargetPaths(fork, "modifier", read)).segmentLabels.feat).toBe("After");
  });
}
