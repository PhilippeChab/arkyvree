import { describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset customization", () => {
  test("answers an entity's modifiers, each target named, and a modifier's requirements", async () => {
    const { api } = await createKeyedApi();
    const { raceMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"][":kind"][":entityId"];

    const modifiers = await expectOk(
      route.modifiers.$get({ param: { entityId: raceMap.pc!.Dwarf!, id, kind: "races" } }),
    );
    expect(modifiers).toContainEqual({
      id: expect.any(String),
      operator: "add",
      target: "abilities.charisma.misc",
      targetLabels: ["Abilities", "Charisma", "Misc"],
      value: "-2",
      valueLabel: null,
      valueType: "number",
    });

    const param = { entityId: modifiers[0]!.id, id, kind: "modifiers" } as const;
    expect(await expectOk(route.requirements.$get({ param }))).toEqual(expect.any(Array));
  });

  test("answers an entity's requirement tree, its groups and checks by place", async () => {
    const { api } = await createKeyedApi();
    const { featMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"][":kind"][":entityId"];

    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" } as const;
    expect(await expectOk(route.requirements.$get({ param }))).toContainEqual({
      chainingOperator: null,
      group: "1",
      id: expect.any(String),
      operator: "greater_than_or_equal",
      target: "abilities.strength.total",
      targetLabels: ["Abilities", "Strength", "Total"],
      value: "13",
      valueLabel: null,
      valueType: "number",
    });
  });

  test("refuses a kind that has no customizations", async () => {
    const { key } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const headers = { authorization: `Bearer ${key.token}` };
    await expectStatus(application.request(`/v1/rulesets/${id}/skills/${NIL_UUID}/modifiers`, { headers }), 400);
  });
});
