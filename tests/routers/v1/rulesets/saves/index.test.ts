import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset saves", () => {
  test("lists saves searched by name, and answers a saving throw, without the database's timestamps", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, saveMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].saves;
    const expected = {
      abilityId: abilityMap.Constitution,
      description: expect.any(String),
      id: saveMap.Fortitude,
      name: "Fortitude",
    };

    const { items } = await expectOk(route.$get({ param: { id }, query: { search: "Fortitude" } }));
    expect(items).toContainEqual(expected);
    expect(await expectOk(route[":saveId"].$get({ param: { id, saveId: saveMap.Fortitude! } }))).toEqual(expected);
    await expectStatus(route[":saveId"].$get({ param: { id, saveId: NIL_UUID } }), 404);
  });
});
