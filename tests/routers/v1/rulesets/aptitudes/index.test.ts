import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
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
});
