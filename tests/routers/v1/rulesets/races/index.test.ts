import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset races", () => {
  test("lists races of a kind, and answers one with the fields its ruleset declares", async () => {
    const { api } = await createKeyedApi();
    const { raceMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].races;
    const dwarf = {
      description: expect.any(String),
      fields: { quadruped: false, speedIgnoresEncumbrance: true },
      id: raceMap.pc!.Dwarf,
      kind: "pc",
      name: "Dwarf",
      parentId: null,
      size: "Medium",
      speed: 20,
    };

    expect((await expectOk(route.$get({ param: { id }, query: { kind: "pc", search: "Dwarf" } }))).items).toEqual([
      dwarf,
    ]);
    const { items: companions } = await expectOk(route.$get({ param: { id }, query: { kind: "animalcompanion" } }));
    expect(companions.every(({ kind }) => kind === "animalcompanion")).toBe(true);

    const raceId = raceMap.pc!.Dwarf!;
    expect(await expectOk(route[":raceId"].$get({ param: { id, raceId } }))).toEqual(dwarf);
    await expectStatus(route[":raceId"].$get({ param: { id, raceId: NIL_UUID } }), 404);
  });

  test("adds a race to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].races;

    const created = await expectOk(
      route.$post({ json: { fields: { quadruped: false }, name: "Goblin", size: "Small", speed: 30 }, param: { id } }),
    );
    expect(created).toMatchObject({
      fields: expect.objectContaining({ quadruped: false }),
      kind: "pc",
      name: "Goblin",
      size: "Small",
      speed: 30,
    });

    const raceId = ctx.raceMap.pc!.Dwarf!;
    const changed = await expectOk(
      route[":raceId"].$put({ json: { name: "Mountain Dwarf", size: "Medium", speed: 20 }, param: { id, raceId } }),
    );
    expect(changed).toMatchObject({ name: "Mountain Dwarf", speed: 20 });
    expect(changed.id).not.toBe(raceId);

    await expectStatus(route[":raceId"].$delete({ param: { id, raceId: created.id } }), 204);
    await expectStatus(route[":raceId"].$get({ param: { id, raceId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].races.$post({
        json: { fields: { quadruped: false }, name: "Goblin", size: "Small", speed: 30 },
        param: { id },
      }),
      403,
    );
  });
});
