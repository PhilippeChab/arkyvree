import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { measure } from "@/tests/support/database.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

test("a read in a ruleset's scope returns the row as stored, once per request", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const [modifier] = await Modifiers.findMany(db, { sourceIds: [sourceId], sourceType: "feats" });
  expect(modifier).toBeDefined();
  await copyEntity(db, "feats", sourceId, fork);

  await runWithRequestCache(() =>
    withRulesetScope(db, fork.id, async () => {
      const { timing } = await measure(async () => {
        // Its source as stored, the feat the fork copied: the view, not the read, resolves it to the copy
        const stored = await Modifiers.findOne(db, { id: modifier.id });
        expect(stored?.sourceId).toBe(sourceId);
        expect(await Modifiers.findOne(db, { id: modifier.id })).toBe(stored);
      });
      expect(timing.queryCount).toBe(1);
      expect(timing.dedupHits).toBe(1);
    }),
  );
});
