import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset skills", () => {
  test("lists skills searched by name, and answers a skill, without the database's timestamps", async () => {
    const { api } = await createKeyedApi();
    const { abilityMap, skillMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].skills;
    const expected = {
      abilityId: abilityMap.Strength,
      description: expect.any(String),
      fields: expect.objectContaining({ usableWithoutTraining: true }),
      id: skillMap.Climb,
      name: "Climb",
    };

    const { items } = await expectOk(route.$get({ param: { id }, query: { search: "Climb" } }));
    expect(items).toContainEqual(expected);
    expect(await expectOk(route[":skillId"].$get({ param: { id, skillId: skillMap.Climb! } }))).toEqual(expected);
    await expectStatus(route[":skillId"].$get({ param: { id, skillId: NIL_UUID } }), 404);
  });
});
