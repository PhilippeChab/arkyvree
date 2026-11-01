import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset, createSeededTestRulesetWithExtensions } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a fork of the seeded ruleset of theirs. */
async function keyedFork() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const fork = await createSeededTestRuleset(user.id);
  return { api, fork, id: fork.id, rulesets: api.v1.rulesets[":id"] };
}

describe("v1 rulesets", () => {
  test("lists the rulesets the user can read, and answers one with what they may do with it", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId } = await getSeedCtx();
    const { items } = await expectOk(api.v1.rulesets.$get({ query: { scope: "base" } }));
    expect(items.map(({ id }) => id)).toContain(rulesetId);

    const ruleset = await expectOk(api.v1.rulesets[":id"].$get({ param: { id: rulesetId } }));
    expect(ruleset).toMatchObject({ id: rulesetId, kind: "ruleset", parentId: null, parentName: null, system: true });
    expect(ruleset.permissions).toMatchObject({ canFork: true });
    await expectStatus(api.v1.rulesets[":id"].$get({ param: { id: NIL_UUID } }), 404);
  });

  test("answers what each base rules' rulesets are made of, which other answers key by", async () => {
    const { api } = await createKeyedApi();
    const rules = (await expectOk(api.v1.rules.$get()))["Dungeons & Dragons: 3.5"]!;
    expect(rules.kinds).toContainEqual(expect.objectContaining({ families: true, type: "feats" }));
    expect(rules.kinds).toContainEqual(expect.objectContaining({ tiered: true, type: "spells" }));
    expect(rules.characterKinds).toContainEqual({ label: "Player Character", value: "pc" });
    expect(rules.fields.feats?.length).toBeGreaterThan(0);
    expect(rules.tiers[0]).toEqual({ label: expect.any(String), level: 0 });
    expect(rules.progression).toEqual({ list: "spellList", picks: "featPicks", several: "severalSpellLists" });
  });

  test("answers a ruleset's settings and extensions", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, rulesetId: id } = await getSeedCtx();
    const ruleset = api.v1.rulesets[":id"];

    const settings = await expectOk(ruleset.settings.$get({ param: { id } }));
    expect(settings.links).toMatchObject({ skillPointAbility: abilityMap.Intelligence });
    expect(Object.keys(settings.fields).length).toBeGreaterThan(0);
    expect(await expectOk(ruleset.extensions.$get({ param: { id } }))).toEqual([]);
    const { user } = await createTestUser();
    const fork = await createSeededTestRulesetWithExtensions(user.id);
    const keyed = await createKeyedApi(user.id);
    expect(await expectOk(keyed.api.v1.rulesets[":id"].extensions.$get({ param: { id: fork.id } }))).toContainEqual(
      expect.objectContaining({ subscribedAt: expect.any(String), updateAvailable: false }),
    );
  });

  test("forks a ruleset, updates it, refusing a stale update, stars it and archives it", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const { rulesetId } = await getSeedCtx();
    const rulesets = api.v1.rulesets[":id"];

    const json = { description: "A keyed fork", name: `Keyed Fork ${crypto.randomUUID()}`, private: true };
    const fork = await expectOk(rulesets.fork.$post({ json, param: { id: rulesetId } }));
    expect(fork).toMatchObject({ name: json.name, parentId: rulesetId, private: true });

    const param = { id: fork.id };
    const updated = await expectOk(
      rulesets.$put({ json: { description: "Renamed", name: json.name, updatedAt: fork.updatedAt }, param }),
    );
    expect(updated.description).toBe("Renamed");
    await expectStatus(
      rulesets.$put({ json: { description: "Stale", name: json.name, updatedAt: fork.updatedAt }, param }),
      409,
    );

    expect((await expectOk(rulesets.star.$post({ param: { id: rulesetId } }))).starred).toBe(true);
    expect((await expectOk(rulesets.star.$delete({ param: { id: rulesetId } }))).starred).toBe(false);
    await expectStatus(rulesets.$delete({ param }), 204);
    expect((await expectOk(rulesets.unarchive.$post({ param }))).status).not.toBe("Archived");
  });

  test("publishes a ruleset", async () => {
    const { id, rulesets } = await keyedFork();
    expect(await expectOk(rulesets.publish.$post({ json: {}, param: { id } }))).toMatchObject({
      id,
      status: "Published",
    });
  });
});
