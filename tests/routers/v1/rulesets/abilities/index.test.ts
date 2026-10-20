import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset abilities", () => {
  test("lists abilities searched by name, and answers an ability, without the database's timestamps", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].abilities;
    const expected = { description: expect.any(String), id: abilityMap.Strength, name: "Strength" };

    const { items } = await expectOk(route.$get({ param: { id }, query: { search: "Strength" } }));
    expect(items).toContainEqual(expected);
    expect(await expectOk(route[":abilityId"].$get({ param: { id, abilityId: abilityMap.Strength! } }))).toEqual(
      expected,
    );
    await expectStatus(route[":abilityId"].$get({ param: { id, abilityId: NIL_UUID } }), 404);
  });
});
