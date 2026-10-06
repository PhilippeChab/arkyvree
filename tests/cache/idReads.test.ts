import { expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { cowEntity } from "@/server/cow/index.ts";
import { type CowData, type IdResolveMap, withCowContext } from "@/server/database/cowContext.ts";
import { db } from "@/server/database/index.ts";
import { mapResultIds } from "@/server/repositories/copyOnWriteIds.ts";
import { Characters, FeatsAptitudes, PowersAptitudes } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

test("a read returning ids gives ids in a ruleset's scope, whose copies map other ids", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  // A copy in the fork fills its scope's map
  await cowEntity(db, "feats", seed.featMap.Toughness, fork.id, [seed.rulesetId], []);
  const [general, wizardSpells] = [seed.aptMap["General"], seed.aptMap["Wizard Spells"]];

  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.cow.idResolveMap.size).toBeGreaterThan(0);
    expect(await FeatsAptitudes.findAptitudeIds(db, { aptitudeIds: [general] })).toEqual([general]);
    expect(await PowersAptitudes.findAptitudeIds(db, { aptitudeIds: [wizardSpells] })).toEqual([wizardSpells]);
    const characterIds = await Characters.findIds(db, { userIds: [SEED_USER_ID] });
    expect(characterIds.length).toBeGreaterThan(0);
    for (const id of characterIds) expect(id).toBeTypeOf("string");
  });
});

test("an id a read returns maps to the copy that wins, as a row's references do; anything else passes through", async () => {
  const cow = {
    sourceChain: [],
    overrideMap: new Map(),
    idResolveMap: new Map([["stale", "winner"]]) as IdResolveMap,
    siblingMap: new Map(),
    siblingIds: new Set(),
  } as unknown as CowData;

  await withCowContext(cow, async () => {
    expect(mapResultIds(["stale", "other", 3, null, ["stale"]])).toEqual(["winner", "other", 3, null, ["stale"]]);
    expect(mapResultIds([{ id: "stale", aptitudeId: "stale" }])).toEqual([{ id: "stale", aptitudeId: "winner" }]);
  });
});
