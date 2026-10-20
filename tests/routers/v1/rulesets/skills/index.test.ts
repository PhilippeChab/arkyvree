import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
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

  test("adds a skill to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].skills;

    const created = await expectOk(
      route.$post({
        json: { abilityId: ctx.abilityMap.Intelligence!, fields: { usableWithoutTraining: false }, name: "Alchemy" },
        param: { id },
      }),
    );
    expect(created).toMatchObject({
      abilityId: ctx.abilityMap.Intelligence,
      fields: expect.objectContaining({ usableWithoutTraining: false }),
      name: "Alchemy",
    });

    const skillId = ctx.skillMap.Climb!;
    const changed = await expectOk(
      route[":skillId"].$put({
        json: { abilityId: ctx.abilityMap.Dexterity!, name: "Scaling" },
        param: { id, skillId },
      }),
    );
    expect(changed).toMatchObject({ abilityId: ctx.abilityMap.Dexterity, name: "Scaling" });
    expect(changed.id).not.toBe(skillId);

    await expectStatus(route[":skillId"].$delete({ param: { id, skillId: created.id } }), 204);
    await expectStatus(route[":skillId"].$get({ param: { id, skillId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].skills.$post({
        json: { abilityId: ctx.abilityMap.Intelligence!, fields: { usableWithoutTraining: false }, name: "Alchemy" },
        param: { id },
      }),
      403,
    );
  });
});
