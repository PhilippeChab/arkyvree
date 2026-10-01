import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

const saves = api.api.rulesets[":id"].saves;
const save = saves[":saveId"];

describe("rulesets saves", () => {
  test("creates, reads, lists, updates and deletes a save", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = { name: "Test Save", description: "A test save", abilityId: abilityMap["Constitution"] };
    const created = await expectOk(saves.$post({ param: { id }, json }));
    expect(created).toMatchObject(json);
    const param = { id, saveId: created.id };

    expect(await expectOk(save.$get({ param }))).toMatchObject({ id: created.id, name: "Test Save" });
    const list = await expectOk(saves.$get({ param: { id }, query: { search: "Test Save" } }));
    expect(list.items.map((s) => s.id)).toContain(created.id);

    const update = { name: "Renamed Save", description: "Updated", abilityId: abilityMap["Wisdom"] };
    expect(await expectOk(save.$put({ param, json: update }))).toMatchObject(update);

    await expectOk(save.$delete({ param }));
    expect((await save.$get({ param })).status).toBe(404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].saves.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects a save without a name or a valid ability id", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    for (const json of [
      { abilityId: abilityMap["Wisdom"] },
      { name: "No ability" },
      { name: "Bad ability", abilityId: "not-a-uuid" },
    ]) {
      expect((await saves.$post({ param: { id }, json: json as never })).status).toBe(400);
    }
  });

  test("returns 404 for a missing ruleset or save", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await saves.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, saveId: NIL_UUID };
    expect((await save.$put({ param, json: { name: "Missing", abilityId: abilityMap["Wisdom"] } })).status).toBe(404);
    expect((await save.$delete({ param })).status).toBe(404);
  });
});
