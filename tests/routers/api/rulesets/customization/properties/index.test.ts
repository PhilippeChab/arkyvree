import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";
import { createEntity, CUSTOMIZABLE_ENTITY_TYPES } from "@/tests/routers/api/rulesets/customization/entities.ts";

const properties = api.api.rulesets[":id"].customization[":entityType"][":entityId"].properties;
const property = properties[":property_id"];

async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, entityId: await createEntity(id, "feats") };
}

describe("rulesets customization properties", () => {
  test("creates, lists, updates and deletes a feat property", async () => {
    const { id, entityId } = await setup();
    const param = { id, entityType: "feats" as const, entityId };
    expect(await expectOk(properties.$get({ param }))).toEqual([]);

    const created = await expectOk(properties.$post({ param, json: { value: "magic weapon", type: "special" } }));
    expect(created).toMatchObject({ value: "magic weapon", type: "special", entityType: "feats", entityId });
    expect((await expectOk(properties.$get({ param }))).map((p) => p.id)).toEqual([created.id]);

    const propertyParam = { ...param, property_id: created.id };
    const updated = await expectOk(
      property.$put({ param: propertyParam, json: { value: "extraordinary ability", type: "special" } }),
    );
    expect(updated).toMatchObject({ value: "extraordinary ability", type: "special" });

    await expectOk(property.$delete({ param: propertyParam }));
    expect(await expectOk(properties.$get({ param }))).toEqual([]);
  });

  test.each(CUSTOMIZABLE_ENTITY_TYPES)("adds a property to %s", async (entityType) => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = await createEntity(id, entityType);
    const created = await expectOk(
      properties.$post({ param: { id, entityType, entityId }, json: { value: "masterwork", type: "quality" } }),
    );
    expect(created).toMatchObject({ entityType, entityId });
  });

  test("requires a session", async () => {
    const { id, entityId } = await setup();
    const response = await guestApi.api.rulesets[":id"].customization[":entityType"][":entityId"].properties.$get({
      param: { id, entityType: "feats", entityId },
    });
    expect(response.status).toBe(401);
  });

  test("rejects a property without a value", async () => {
    const { id, entityId } = await setup();
    const response = await properties.$post({
      param: { id, entityType: "feats", entityId },
      json: { type: "special" } as never,
    });
    expect(response.status).toBe(400);
  });

  test("returns 404 for a missing ruleset, entity or property", async () => {
    const { id, entityId } = await setup();
    expect((await properties.$get({ param: { id: NIL_UUID, entityType: "feats", entityId } })).status).toBe(404);
    expect((await properties.$get({ param: { id, entityType: "feats", entityId: NIL_UUID } })).status).toBe(404);
    const param = { id, entityType: "feats" as const, entityId, property_id: NIL_UUID };
    expect((await property.$put({ param, json: { value: "missing", type: "test" } })).status).toBe(404);
    expect((await property.$delete({ param })).status).toBe(404);
  });
});
