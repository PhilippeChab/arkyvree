import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { CUSTOMIZABLE_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";
import { createEntity } from "@/tests/routers/api/rulesets/customization/entities.ts";

const customization = api.api.rulesets[":id"].customization[":entityType"][":entityId"];
const requirements = customization.requirements;
const requirement = requirements[":requirementId"];
const charisma13 = { level: "1", target: "abilities.charisma.total", value: "13", operator: "greater_than_or_equal" };

async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, entityId: await createEntity(id, "feats") };
}

describe("rulesets customization requirements", () => {
  test("creates, lists, updates and deletes a feat requirement", async () => {
    const { id, entityId } = await setup();
    const param = { id, entityType: "feats" as const, entityId };
    expect(await expectOk(requirements.$get({ param }))).toEqual([]);

    const created = await expectOk(requirements.$post({ param, json: charisma13 }));
    expect(created).toMatchObject({
      ...charisma13,
      valueType: "number",
      chainingOperator: null,
      entityType: "feats",
      entityId,
    });
    expect((await expectOk(requirements.$get({ param }))).map((r) => r.id)).toEqual([created.id]);

    const requirementParam = { ...param, requirementId: created.id };
    const updated = await expectOk(requirement.$put({ param: requirementParam, json: { ...charisma13, value: "15" } }));
    expect(updated.value).toBe("15");

    await expectOk(requirement.$delete({ param: requirementParam }));
    expect(await expectOk(requirements.$get({ param }))).toEqual([]);
  });

  test("creates a chaining requirement without a target", async () => {
    const { id, entityId } = await setup();
    const created = await expectOk(
      requirements.$post({
        param: { id, entityType: "feats", entityId },
        json: { level: "1", chainingOperator: "and" },
      }),
    );
    expect(created).toMatchObject({
      level: "1",
      chainingOperator: "and",
      target: null,
      value: null,
      valueType: null,
      operator: null,
    });
  });

  test.each([...CUSTOMIZABLE_ENTITY_TYPES])("adds a requirement to %s", async (entityType) => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = await createEntity(id, entityType);
    const created = await expectOk(requirements.$post({ param: { id, entityType, entityId }, json: charisma13 }));
    expect(created).toMatchObject({ entityType, entityId });
  });

  test("adds a requirement to a modifier", async () => {
    const { id, entityId } = await setup();
    const modifier = await expectOk(
      customization.modifiers.$post({
        param: { id, entityType: "feats", entityId },
        json: { target: "abilities.strength.misc", value: "2", operator: "add" },
      }),
    );
    const created = await expectOk(
      requirements.$post({ param: { id, entityType: "modifiers", entityId: modifier.id }, json: charisma13 }),
    );
    expect(created).toMatchObject({ entityType: "modifiers", entityId: modifier.id });
  });

  test("requires a session", async () => {
    const { id, entityId } = await setup();
    const response = await guestApi.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements.$get({
      param: { id, entityType: "feats", entityId },
    });
    await expectStatus(response, 401);
  });

  test("rejects a requirement without a level", async () => {
    const { id, entityId } = await setup();
    const { level: _level, ...withoutLevel } = charisma13;
    const response = await requirements.$post({
      param: { id, entityType: "feats", entityId },
      json: withoutLevel as never,
    });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset, entity or requirement", async () => {
    const { id, entityId } = await setup();
    await expectStatus(requirements.$get({ param: { id: NIL_UUID, entityType: "feats", entityId } }), 404);
    await expectStatus(requirements.$get({ param: { id, entityType: "feats", entityId: NIL_UUID } }), 404);
    const param = { id, entityType: "feats" as const, entityId, requirementId: NIL_UUID };
    await expectStatus(requirement.$put({ param, json: charisma13 }), 404);
    await expectStatus(requirement.$delete({ param }), 404);
  });
});
