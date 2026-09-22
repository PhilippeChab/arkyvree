import { afterEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { getOrBuildCowData, getOrFetchRulesetData, invalidateAll, invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { cowEntity } from "@/server/services/rulesets/cow.ts";
import { setCacheEnabled } from "@/server/cache/MemoryCache.ts";

afterEach(() => { invalidateAll(); setCacheEnabled(true); });

test("extension COW invalidates the warm subscriber mapping", async () => {
  invalidateAll();
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const extension = await createSeededTestRuleset(session.userId);
  await Rulesets.update(db, { kind: "extension", status: "Published" }, { id: extension.id });
  const host = await createSeededTestRuleset(session.userId);
  await Rulesets.update(db, { extensionRulesetIds: [extension.id] }, { id: host.id });
  const updatedHost = (await Rulesets.findOne(db, { id: host.id }))!;
  const source = (await Feats.findOne(db, { rulesetId: extension.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
  const before = await getOrBuildCowData(updatedHost);
  await getOrFetchRulesetData(host.id, before);
  const copy = await cowEntity(db, "feats", source.id, extension.id, extension.ancestorRulesetIds);
  await Feats.update(db, { description: "Updated extension feat" }, { id: copy.id });
  invalidateRuleset(extension.id);
  const after = await getOrBuildCowData(updatedHost);
  expect(after).not.toBe(before);
  expect(after.idResolveMap.get(source.id)).toBe(copy.id);
  const data = await getOrFetchRulesetData(host.id, after);
  expect(data.featsById.get(copy.id)?.description).toBe("Updated extension feat");
  expect(data.feats.some(f => f.id === source.id)).toBe(false);
});

test("worker cache mode reads changes between builds without web invalidation", async () => {
  setCacheEnabled(false);
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { name: "Worker freshness", description: "Before", rulesetId: fork.id });
  const first = await getOrFetchRulesetData(fork.id, await getOrBuildCowData(fork));
  expect(first.featsById.get(feat.id)?.description).toBe("Before");
  await Feats.update(db, { description: "After" }, { id: feat.id });
  const next = await getOrFetchRulesetData(fork.id, await getOrBuildCowData(fork));
  expect(next.featsById.get(feat.id)?.description).toBe("After");
});
