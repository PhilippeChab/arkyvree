import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
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
});
