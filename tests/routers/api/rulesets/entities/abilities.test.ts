import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "abilities" as const;

describe("rulesets entities: abilities", () => {
  test("lists and reads the abilities a fork inherits", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { limit: "100" } }));
    expect(list.items.map((a) => a.name).sort()).toEqual([
      "Charisma",
      "Constitution",
      "Dexterity",
      "Intelligence",
      "Strength",
      "Wisdom",
    ]);

    const strength = await expectOk(entity.$get({ param: { id, entityType, entityId: abilityMap["Strength"] } }));
    expect(strength).toMatchObject({ id: abilityMap["Strength"], name: "Strength" });
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("returns 404 for a missing ruleset or ability", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    await expectStatus(entity.$get({ param: { id, entityType, entityId: NIL_UUID } }), 404);
  });
});
