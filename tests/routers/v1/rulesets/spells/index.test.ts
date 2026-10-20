import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset spells", () => {
  test("lists a spell list's spells at a level, and answers one with its lists and fields", async () => {
    const { api } = await createKeyedApi();
    const { aptMap, powerMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].spells;
    const aptitudeId = aptMap["Wizard Spells"]!;

    const query = { aptitudeId, level: "3", limit: "100" };
    const { items } = await expectOk(route.$get({ param: { id }, query }));
    expect(items.map(({ name }) => name)).toContain("Fireball");
    expect(items.map(({ name }) => name)).not.toContain("Magic Missile");

    const spellId = powerMap.Fireball!;
    const fireball = await expectOk(route[":spellId"].$get({ param: { id, spellId } }));
    expect(fireball).toMatchObject({ id: spellId, name: "Fireball", saveEffect: "half" });
    expect(fireball.aptitudes).toContainEqual({ id: aptitudeId, level: 3, name: "Wizard Spells" });
    expect(fireball.fields).toMatchObject({ descriptors: ["Fire"], school: "Evocation" });
    await expectStatus(route[":spellId"].$get({ param: { id, spellId: NIL_UUID } }), 404);
  });
});
