import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
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

  test("adds a feat to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].feats;

    const created = await expectOk(
      route.$post({
        json: { aptitudeIds: [ctx.aptMap.General!], fields: { families: [] }, name: "Steady Aim" },
        param: { id },
      }),
    );
    expect(created).toMatchObject({
      aptitudes: [{ id: ctx.aptMap.General, name: "General" }],
      name: "Steady Aim",
      selectable: true,
    });

    const featId = ctx.featMap["Power Attack"]!;
    const changed = await expectOk(route[":featId"].$put({ json: { name: "Mighty Blow" }, param: { id, featId } }));
    const unpooled = { aptitudeIds: [], name: "Mighty Blow" };
    await expectStatus(route[":featId"].$put({ json: unpooled, param: { id, featId: changed.id } }), 400);
    expect(changed).toMatchObject({ name: "Mighty Blow" });
    expect(changed.id).not.toBe(featId);

    await expectStatus(route[":featId"].$delete({ param: { id, featId: created.id } }), 204);
    await expectStatus(route[":featId"].$get({ param: { id, featId: created.id } }), 404);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].feats.$post({
        json: { aptitudeIds: [ctx.aptMap.General!], fields: { families: [] }, name: "Steady Aim" },
        param: { id },
      }),
      403,
    );
  });
});
