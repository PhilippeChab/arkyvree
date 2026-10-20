import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset feats", () => {
  test("lists feats by aptitude and family, and answers one with its aptitudes and fields", async () => {
    const { api } = await createKeyedApi();
    const { aptMap, featMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].feats;
    const aptitudeId = aptMap["Fighter Bonus Feat"]!;

    const { items: bonusFeats } = await expectOk(route.$get({ param: { id }, query: { aptitudeId, search: "Power" } }));
    expect(bonusFeats.map(({ name }) => name)).toContain("Power Attack");
    expect(bonusFeats.every(({ aptitudes }) => aptitudes.some((aptitude) => aptitude.id === aptitudeId))).toBe(true);
    const { items: focuses } = await expectOk(route.$get({ param: { id }, query: { family: "Weapon Focus" } }));
    expect(focuses.length).toBeGreaterThan(0);
    expect(focuses.every(({ fields }) => (fields.families as string[]).includes("Weapon Focus"))).toBe(true);

    const featId = featMap["Power Attack"]!;
    const powerAttack = await expectOk(route[":featId"].$get({ param: { featId, id } }));
    expect(powerAttack).toMatchObject({ id: featId, name: "Power Attack", selectable: true, stackable: false });
    expect(powerAttack.aptitudes).toContainEqual({ id: aptitudeId, name: "Fighter Bonus Feat" });
    expect(powerAttack.fields).toEqual({
      families: [],
      oversizedTwoWeaponFighting: false,
      prohibitedSchools: [],
      weaponFinesse: false,
    });
    await expectStatus(route[":featId"].$get({ param: { featId: NIL_UUID, id } }), 404);
  });
});
