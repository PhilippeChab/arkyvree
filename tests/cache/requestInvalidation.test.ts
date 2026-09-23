import { afterEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { Feats, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { getSeedContext } from "@/database/seeds/helpers.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { TargetPathsMethods } from "@/server/services/rulesets/customization/TargetPathsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";

afterEach(invalidateAll);

// Real repository reads in separate request contexts: an earlier request loads
// again only after another request's mutation and cache invalidation complete.
async function overlap(read: () => Promise<unknown>, mutate: () => Promise<unknown>) {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const old = runWithRequestCache(async () => {
    try { await read(); ready.resolve(); }
    catch (error) { ready.reject(error); throw error; }
    await release.promise;
    await read();
  });
  try {
    await ready.promise;
    await runWithRequestCache(mutate);
  } finally {
    release.resolve();
    await old;
  }
}

for (const action of ["subscribe", "unsubscribe"] as const) {
  test(`old request metadata cannot undo ${action} in shared COW data or paths`, async () => {
    const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
    const host = await createSeededTestRuleset(session.userId);
    const extension = await createSeededTestRuleset(session.userId);
    await Rulesets.update(db, { kind: "extension", status: "Published", private: false }, { id: extension.id });
    const [feat] = await Feats.create(db, { rulesetId: extension.id, name: "Extension Marker" });
    if (action === "unsubscribe") await RulesetsMethods.subscribeExtension(session, host.id, [extension.id]);
    invalidateAll();
    await overlap(
      () => TargetPathsMethods.getTargetPathsWithLabels(host.id, "requirement"),
      () => action === "subscribe"
        ? RulesetsMethods.subscribeExtension(session, host.id, [extension.id])
        : RulesetsMethods.unsubscribeExtension(session, host.id, extension.id),
    );
    await runWithRequestCache(async () => {
      await withRulesetScope(db, host.id, async ({ rulesetData }) => {
        expect(rulesetData.featsById.has(feat.id)).toBe(action === "subscribe");
      });
      const paths = await TargetPathsMethods.getTargetPathsWithLabels(host.id, "requirement");
      expect(paths.paths.some(path => path.path === "feats.extensionmarker.possessed")).toBe(action === "subscribe");
    });
  });
}

for (const scenario of ["entity", "cow", "paths"] as const) {
  test(`an old request cannot refill shared ${scenario} data from stale deduplicated reads`, async () => {
    const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
    const fork = await createSeededTestRuleset(session.userId);
    const seed = await getSeedContext(db);
    const [local] = await Feats.create(db, { rulesetId: fork.id, name: "Before Marker", description: "before" });
    invalidateAll();
    const read = () => scenario === "paths"
      ? TargetPathsMethods.getTargetPathsWithLabels(fork.id, "requirement")
      : withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData);
    let copyId: string | undefined;
    await overlap(read, async () => {
      if (scenario === "cow") {
        const copy = await PropertiesMethods.createEntityProperty(session, fork.id, "feats", seed.featMap.Toughness, { type: "QA", value: "1" });
        copyId = copy.resolvedEntityId;
      } else {
        await FeatsMethods.updateRulesetFeat(session, fork.id, local.id, { name: "After Marker", description: "after" });
      }
    });
    await runWithRequestCache(async () => {
      if (scenario === "paths") {
        const result = await TargetPathsMethods.getTargetPathsWithLabels(fork.id, "requirement");
        expect(result.paths.some(path => path.path === "feats.aftermarker.possessed")).toBe(true);
        expect(result.paths.some(path => path.path === "feats.beforemarker.possessed")).toBe(false);
      } else {
        await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
          if (scenario === "cow") {
            expect(copyId).not.toBe(seed.featMap.Toughness);
            expect(rulesetData.canonicalize(seed.featMap.Toughness)).toBe(copyId!);
          } else expect(rulesetData.featsById.get(local.id)?.description).toBe("after");
        });
      }
    });
  });
}
