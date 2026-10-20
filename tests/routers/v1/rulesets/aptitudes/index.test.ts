import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset aptitudes", () => {
  test("lists aptitudes, those feats or spells are picked in, and answers one", async () => {
    const { api } = await createKeyedApi();
    const { aptMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].aptitudes;
    const bonusFeats = { description: null, id: aptMap["Fighter Bonus Feat"], name: "Fighter Bonus Feat" };

    const feats = await expectOk(route.$get({ param: { id }, query: { scope: "feats", search: "Fighter Bonus" } }));
    expect(feats.items).toContainEqual(bonusFeats);
    const spells = await expectOk(route.$get({ param: { id }, query: { scope: "spells", search: "Fighter Bonus" } }));
    expect(spells.items).not.toContainEqual(bonusFeats);

    const aptitudeId = aptMap["Fighter Bonus Feat"]!;
    expect(await expectOk(route[":aptitudeId"].$get({ param: { aptitudeId, id } }))).toEqual(bonusFeats);
    await expectStatus(route[":aptitudeId"].$get({ param: { aptitudeId: NIL_UUID, id } }), 404);
  });

  test("adds an aptitude to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].aptitudes;

    const created = await expectOk(
      route.$post({ json: { description: "Picked at a ritual", name: "Ritual Feat" }, param: { id } }),
    );
    expect(created).toMatchObject({ description: "Picked at a ritual", name: "Ritual Feat" });

    const aptitudeId = ctx.aptMap["Fighter Bonus Feat"]!;
    const changed = await expectOk(
      route[":aptitudeId"].$put({ json: { name: "Warrior Bonus Feat" }, param: { id, aptitudeId } }),
    );
    expect(changed).toMatchObject({ description: null, name: "Warrior Bonus Feat" });
    expect(changed.id).not.toBe(aptitudeId);

    await expectStatus(route[":aptitudeId"].$delete({ param: { id, aptitudeId: created.id } }), 204);
    await expectStatus(route[":aptitudeId"].$get({ param: { id, aptitudeId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].aptitudes.$post({
        json: { description: "Picked at a ritual", name: "Ritual Feat" },
        param: { id },
      }),
      403,
    );
  });
});
