import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { getDnd5SeedCtx } from "@/tests/support/dnd5/seed.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** A pool as a progression's answer names it. */
interface PoolRef {
  id: string;
  name: string;
}

const session = makeSession();

/** The seed user's private fork of the seeded core rules, and its inherited class of this name. */
async function forkWithClass(name: string) {
  const { rulesetId } = await getDnd5SeedCtx();
  const fork = await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
  const klass = (await Entities.findOne(db, { entityType: "classes", name, rulesetId: fork.rulesetId! }))!;
  return { fork, klass };
}

/** What a class's Progression tab offers, as its progression's answer gives it. */
async function readOffers(rulesetId: string, classId: string) {
  const answer = (await EntitiesService.getProgression(session, rulesetId, "classes", classId)) as {
    featurePools: PoolRef[];
    offeredPools: PoolRef[];
    ownFeaturePool: { featureName: string; id: string | null; name: string };
  };
  return {
    featurePools: answer.featurePools.map((pool) => pool.name),
    offeredPools: answer.offeredPools.map((pool) => pool.name),
    ownFeaturePool: answer.ownFeaturePool,
  };
}

describe("A D&D 5th Edition class's features and feat pools", () => {
  test("grant its features through its own pool, the content's, which no pick offers", async () => {
    const { fork, klass } = await forkWithClass("Fighter");
    const offers = await readOffers(fork.id, klass.id);
    // Its own feature pool is the one its levels grant through, "Fighter Features", there already
    expect(offers.ownFeaturePool).toMatchObject({ name: "Fighter Features", featureName: "{name} (Fighter)" });
    expect(offers.ownFeaturePool.id).not.toBeNull();
    expect(offers.featurePools).toContain("Fighter Features");
    // A class's feature pool holds what its levels grant outright, which no pick chooses: its own and the others'
    expect(offers.offeredPools).toEqual(expect.arrayContaining(["Fighter Subclass", "Ability Score Improvement"]));
    expect(offers.offeredPools.filter((name) => name.endsWith(" Features"))).toEqual([]);
    // A feature typed on its page is made in it
    const created = await EntitiesService.getNewFeature(session, fork.id, "classes", klass.id, "Second Wind Plus");
    expect(created).toMatchObject({ name: "Second Wind Plus (Fighter)" });
  });
});
