import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { CowData } from "@/engine/core/cow/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, withCowContext } from "@/server/database/index.ts";
import { mapResultIds } from "@/server/repositories/copyOnWriteIds.ts";
import { Characters } from "@/server/repositories/index.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

test("a read returning ids gives ids in a ruleset's scope, whose copies map other ids", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  // A copy in the fork fills its scope's map
  await copyEntity(db, "feats", seed.featMap.Toughness, fork);

  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.cow.isEmpty()).toBe(false);
    const characterIds = await Characters.findIds(db, { userIds: [SEED_USER_ID] });
    expect(characterIds.length).toBeGreaterThan(0);
    for (const id of characterIds) expect(id).toBeTypeOf("string");
  });
});

test("an id a read returns maps to the copy that wins, as a row's references do; anything else passes through", async () => {
  const cow = new CowData([], new Map(), new Map([["stale", "winner"]]), new Map());

  await withCowContext(cow, async () => {
    expect(mapResultIds(["stale", "other", 3, null, ["stale"]])).toEqual(["winner", "other", 3, null, ["stale"]]);
    expect(mapResultIds([{ id: "stale", aptitudeId: "stale" }])).toEqual([{ id: "stale", aptitudeId: "winner" }]);
  });
});
