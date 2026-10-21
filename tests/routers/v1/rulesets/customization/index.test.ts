import { describe, expect, test } from "bun:test";

import { application } from "@/server/routers/application.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
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

  test("adds a modifier to an inherited feat on a copy of its own, copies it, changes it and deletes it", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { featMap } = await getSeedCtx();
    const route = api.v1.rulesets[":id"][":kind"][":entityId"];
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" } as const;
    const json = { operator: "add", target: "abilities.strength.misc", value: "1" } as const;

    const created = await expectOk(route.modifiers.$post({ json, param }));
    expect(created).toMatchObject({ ...json, targetLabels: ["Abilities", "Strength", "Misc"], valueType: "number" });
    // The fork's own copy of the feat, which its modifiers are now on
    const [copy] = (await expectOk(api.v1.rulesets[":id"].feats.$get({ param: { id }, query: { childOnly: "true" } })))
      .items;
    const owned = { ...param, entityId: copy!.id };
    expect((await expectOk(route.modifiers.$get({ param: owned }))).map(({ id: modifierId }) => modifierId)).toContain(
      created.id,
    );

    const modifierParam = { ...owned, modifierId: created.id };
    const copied = await expectOk(
      route.modifiers[":modifierId"].duplicate.$post({ json: { ...json, value: "2" }, param: modifierParam }),
    );
    expect(copied).toMatchObject({ value: "2" });
    expect(copied.id).not.toBe(created.id);
    const changed = await expectOk(
      route.modifiers[":modifierId"].$put({ json: { ...json, value: "3" }, param: modifierParam }),
    );
    expect(changed).toMatchObject({ id: created.id, value: "3" });
    await expectStatus(route.modifiers[":modifierId"].$delete({ param: modifierParam }), 204);
    expect((await expectOk(route.modifiers.$get({ param: owned }))).map(({ value }) => value)).toEqual(["2"]);
  });

  test("refuses a modifier on a path its entity can't take, saying what's wrong", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const { featMap } = await getSeedCtx();
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" } as const;
    const json = { operator: "add", target: "abilities.strenght.misc", value: "1" } as const;

    const refused = await expectStatus(
      api.v1.rulesets[":id"][":kind"][":entityId"].modifiers.$post({ json, param }),
      400,
    );
    expect(await refused.text()).toContain("Invalid modifier path");
  });

  test("adds a requirement group and a check under it, changes the check and deletes it", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const route = api.v1.rulesets[":id"][":kind"][":entityId"];
    const { id: entityId } = await expectOk(
      api.v1.rulesets[":id"].classes.$post({ json: { hitDie: 8, name: "Warden" }, param: { id } }),
    );
    const param = { entityId, id, kind: "classes" } as const;

    const group = await expectOk(route.requirements.$post({ json: { chainingOperator: "and", group: "1" }, param }));
    expect(group).toMatchObject({ chainingOperator: "and", group: "1", target: null });
    const check = {
      group: "1.1",
      operator: "greater_than_or_equal",
      target: "abilities.wisdom.total",
      value: "13",
      valueType: "number",
    } as const;
    const created = await expectOk(route.requirements.$post({ json: check, param }));
    expect(created).toMatchObject({ ...check, targetLabels: ["Abilities", "Wisdom", "Total"] });

    const requirementParam = { ...param, requirementId: created.id };
    const changed = await expectOk(
      route.requirements[":requirementId"].$put({ json: { ...check, value: "15" }, param: requirementParam }),
    );
    expect(changed).toMatchObject({ id: created.id, value: "15" });
    await expectStatus(route.requirements[":requirementId"].$delete({ param: requirementParam }), 204);
    expect(await expectOk(route.requirements.$get({ param }))).toEqual([group]);
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const { featMap, rulesetId: id } = await getSeedCtx();
    const param = { entityId: featMap["Power Attack"]!, id, kind: "feats" } as const;
    const json = { operator: "add", target: "abilities.strength.misc", value: "1" } as const;
    await expectStatus(api.v1.rulesets[":id"][":kind"][":entityId"].modifiers.$post({ json, param }), 403);
  });
});
