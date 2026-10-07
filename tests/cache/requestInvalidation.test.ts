import { afterEach, expect, test } from "bun:test";

import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import { Feats, Rulesets } from "@/server/repositories/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { getTargetPathsWithLabels } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/**
 * Real repository reads in separate request contexts: an earlier request loads again only after another request's
 * mutation and cache invalidation complete.
 */
async function overlap(read: () => Promise<unknown>, mutate: () => Promise<unknown>) {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const old = runWithRequestCache(async () => {
    try {
      await read();
      ready.resolve();
    } catch (error) {
      ready.reject(error);
      throw error;
    }
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

afterEach(() => RulesetCache.invalidateAll());

for (const action of ["subscribe", "unsubscribe"] as const) {
  test(`old request metadata cannot undo ${action} in shared COW data or paths`, async () => {
    const session = makeSession();
    const host = await createSeededTestRuleset(session.userId);
    const extension = await createSeededTestRuleset(session.userId);
    await Rulesets.update(db, { kind: "extension", status: "Published", private: false }, { id: extension.id });
    const [feat] = await Feats.create(db, { rulesetId: extension.id, name: "Extension Marker" });
    if (action === "unsubscribe") await RulesetExtensionsService.subscribeExtension(session, host.id, [extension.id]);
    RulesetCache.invalidateAll();
    await overlap(
      () => getTargetPathsWithLabels(host.id, "requirement"),
      () =>
        action === "subscribe"
          ? RulesetExtensionsService.subscribeExtension(session, host.id, [extension.id])
          : RulesetExtensionsService.unsubscribeExtension(session, host.id, extension.id),
    );
    await runWithRequestCache(async () => {
      await withRulesetScope(db, host.id, async ({ rulesetData }) => {
        expect(rulesetData.featsById.has(feat.id)).toBe(action === "subscribe");
      });
      const paths = await getTargetPathsWithLabels(host.id, "requirement");
      expect(paths.paths.some((path) => path.path === "feats.extensionmarker.possessed")).toBe(action === "subscribe");
    });
  });
}

for (const scenario of ["entity", "cow", "paths"] as const) {
  test(`an old request cannot refill shared ${scenario} data from stale deduplicated reads`, async () => {
    const session = makeSession();
    const fork = await createSeededTestRuleset(session.userId);
    const seed = await getSeedCtx();
    const [local] = await Feats.create(db, { rulesetId: fork.id, name: "Before Marker", description: "before" });
    RulesetCache.invalidateAll();
    const read = () =>
      scenario === "paths"
        ? getTargetPathsWithLabels(fork.id, "requirement")
        : withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData);
    let copyId: string | undefined;
    await overlap(read, async () => {
      if (scenario === "cow") {
        const copy = await PropertiesService.createProperty(session, fork.id, "feats", seed.featMap.Toughness, {
          type: "QA",
          value: "1",
        });
        copyId = copy.resolvedEntityId;
      } else {
        await FeatsService.updateFeat(session, fork.id, local.id, {
          name: "After Marker",
          description: "after",
        });
      }
    });
    await runWithRequestCache(async () => {
      if (scenario === "paths") {
        const result = await getTargetPathsWithLabels(fork.id, "requirement");
        expect(result.paths.some((path) => path.path === "feats.aftermarker.possessed")).toBe(true);
        expect(result.paths.some((path) => path.path === "feats.beforemarker.possessed")).toBe(false);
      } else {
        await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
          if (scenario === "cow") {
            expect(copyId).not.toBe(seed.featMap.Toughness);
            expect(rulesetData.canonicalize(seed.featMap.Toughness)).toBe(copyId!);
          } else {
            expect(rulesetData.featsById.get(local.id)?.description).toBe("after");
          }
        });
      }
    });
  });
}
