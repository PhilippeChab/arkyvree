import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { createSeededTestRulesetWithExtensions, sourcesOf } from "@/tests/support/rulesets.ts";

test("the system rulesets' rows warmed at boot are the ones a fork's first write reads, not read again", async () => {
  const fork = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
  const sources = await sourcesOf(fork.id);
  RulesetViews.invalidateAll();
  await RulesetViews.warm();
  const warmed = await Promise.all(sources.extensionIds.map((id) => RulesetViews.getRawData(id)));

  // A write's fresh read of the fork, at the versions its locks would read
  const ids = [fork.id, ...sources.extensionIds, ...(sources.parentId ? [sources.parentId] : [])];
  await RulesetViews.getFreshData(db, sources, fork.baseRules, await Rulesets.findVersions(db, { ids }));
  const kept = await Promise.all(sources.extensionIds.map((id) => RulesetViews.getRawData(id)));
  expect(kept.every((rows, index) => rows === warmed[index])).toBe(true);
  expect(sources.extensionIds.length).toBeGreaterThan(0);
});
