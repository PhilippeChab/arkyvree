import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { withCowContext } from "@/server/database/cowContext.ts";
import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { measure } from "@/tests/support/database.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

test("stored modifier reads preserve ownership without changing ordinary COW reads", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const [modifier] = await Modifiers.findMany(db, { sourceIds: [sourceId], sourceType: "feats" });
  expect(modifier).toBeDefined();
  const copy = await copyEntity(db, "feats", sourceId, fork);

  await runWithRequestCache(() =>
    withRulesetScope(db, fork.id, async () => {
      const { timing } = await measure(async () => {
        const resolved = await Modifiers.findOne(db, { id: modifier.id });
        const stored = await withCowContext(undefined, () => Modifiers.findOne(db, { id: modifier.id }));
        expect(resolved?.sourceId).toBe(copy.id);
        expect(stored?.sourceId).toBe(sourceId);
        expect(stored?.id).toBe(modifier.id);
        expect(await withCowContext(undefined, () => Modifiers.findOne(db, { id: modifier.id }))).toBe(stored);
        expect(await Modifiers.findOne(db, { id: modifier.id })).toBe(resolved);
      });
      expect(timing.queryCount).toBe(2);
      expect(timing.dedupHits).toBe(2);
    }),
  );
});
