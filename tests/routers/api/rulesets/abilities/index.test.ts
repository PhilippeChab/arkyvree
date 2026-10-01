import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

const abilities = api.api.rulesets[":id"].abilities;

describe("rulesets abilities", () => {
  test("lists and reads the abilities a fork inherits", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const list = await expectOk(abilities.$get({ param: { id }, query: { limit: "100" } }));
    expect(list.items.map((a) => a.name).sort()).toEqual([
      "Charisma",
      "Constitution",
      "Dexterity",
      "Intelligence",
      "Strength",
      "Wisdom",
    ]);

    const strength = await expectOk(abilities[":abilityId"].$get({ param: { id, abilityId: abilityMap["Strength"] } }));
    expect(strength).toMatchObject({ id: abilityMap["Strength"], name: "Strength" });
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].abilities.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("returns 404 for a missing ruleset or ability", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await abilities.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    expect((await abilities[":abilityId"].$get({ param: { id, abilityId: NIL_UUID } })).status).toBe(404);
  });
});
