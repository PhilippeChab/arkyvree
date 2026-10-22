import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
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

  test("adds a saving throw to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].saves;

    const created = await expectOk(
      route.$post({ json: { abilityId: ctx.abilityMap.Wisdom!, name: "Sanity" }, param: { id } }),
    );
    expect(created).toMatchObject({ abilityId: ctx.abilityMap.Wisdom, name: "Sanity" });

    const saveId = ctx.saveMap.Fortitude!;
    const changed = await expectOk(
      route[":saveId"].$put({
        json: { abilityId: ctx.abilityMap.Constitution!, name: "Toughness" },
        param: { id, saveId },
      }),
    );
    expect(changed).toMatchObject({ name: "Toughness" });
    expect(changed.id).not.toBe(saveId);

    await expectStatus(route[":saveId"].$delete({ param: { id, saveId: created.id } }), 204);
    await expectStatus(route[":saveId"].$get({ param: { id, saveId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].saves.$post({
        json: { abilityId: ctx.abilityMap.Wisdom!, name: "Sanity" },
        param: { id },
      }),
      403,
    );
  });
});
