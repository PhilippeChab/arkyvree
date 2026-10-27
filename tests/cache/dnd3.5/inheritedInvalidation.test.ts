import { afterEach, expect, test } from "bun:test";

import type { Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import MemoryCache from "@/server/cache/MemoryCache.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Rulesets } from "@/server/repositories/index.ts";
import { copyEntity, createSeededTestRuleset, subscribeTestRuleset } from "@/tests/support/rulesets.ts";
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
  const updatedHost = await subscribeTestRuleset(host.id, [extension.id]);
  const source = (await Entities.findOne<Feat>(db, {
    entityType: "feats",
    rulesetId: extension.ancestorRulesetIds[0],
    name: "Skill Focus: Climb",
  }))!;
  const before = await RulesetViews.getCowData(updatedHost);
  await RulesetViews.getData(updatedHost);
  const copy = await copyEntity(db, "feats", source.id, extension);
  await Entities.update<Feat>(db, "feats", { description: "Updated extension feat" }, { id: copy.id });
  RulesetViews.invalidate(extension.id);
  const after = await RulesetViews.getCowData(updatedHost);
  expect(after).not.toBe(before);
  expect(after.resolve(source.id)).toBe(copy.id);
  const data = await RulesetViews.getData(updatedHost);
  const dataView = Dnd35View.of(data);
  expect(dataView.featsById.get(copy.id)?.description).toBe("Updated extension feat");
  expect(dataView.feats.some((f) => f.id === source.id)).toBe(false);
});

test("worker cache mode reads changes between builds without web invalidation", async () => {
  MemoryCache.setEnabled(false);
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const [feat] = await Entities.create<Feat>(db, "feats", {
    name: "Worker freshness",
    description: "Before",
    rulesetId: fork.id,
  });
  const first = await RulesetViews.getData(fork);
  expect(Dnd35View.of(first).featsById.get(feat.id)?.description).toBe("Before");
  await Entities.update<Feat>(db, "feats", { description: "After" }, { id: feat.id });
  const next = await RulesetViews.getData(fork);
  expect(Dnd35View.of(next).featsById.get(feat.id)?.description).toBe("After");
});

test("disabled caches do not coalesce raw reads across worker jobs", async () => {
  MemoryCache.setEnabled(false);
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const [first, second] = await Promise.all([RulesetViews.getRawData(fork.id), RulesetViews.getRawData(fork.id)]);
  expect(first).not.toBe(second);
});
