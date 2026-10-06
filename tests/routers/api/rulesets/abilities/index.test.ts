import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

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
    await expectStatus(guestApi.api.rulesets[":id"].abilities.$get({ param: { id }, query: {} }), 401);
  });

  test("returns 404 for a missing ruleset or ability", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(abilities.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    await expectStatus(abilities[":abilityId"].$get({ param: { id, abilityId: NIL_UUID } }), 404);
  });
});
