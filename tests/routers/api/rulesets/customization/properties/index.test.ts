import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { CUSTOMIZABLE_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";
import { createEntity } from "@/tests/routers/api/rulesets/customization/entities.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const properties = api.api.rulesets[":id"].customization[":entityType"][":entityId"].properties;
const property = properties[":propertyId"];

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

    const propertyParam = { ...param, propertyId: created.id };
    const updated = await expectOk(
      property.$put({ param: propertyParam, json: { value: "extraordinary ability", type: "special" } }),
    );
    expect(updated).toMatchObject({ value: "extraordinary ability", type: "special" });

    await expectOk(property.$delete({ param: propertyParam }));
    expect(await expectOk(properties.$get({ param }))).toEqual([]);
  });

  test.each([...CUSTOMIZABLE_ENTITY_TYPES])("adds a property to %s", async (entityType) => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = await createEntity(id, entityType);
    const created = await expectOk(
      properties.$post({
        param: { id, entityType: getUrlSegment(entityType), entityId },
        json: { value: "masterwork", type: "quality" },
      }),
    );
    expect(created).toMatchObject({ entityType, entityId });
  });

  test("requires a session", async () => {
    const { id, entityId } = await setup();
    const response = await guestApi.api.rulesets[":id"].customization[":entityType"][":entityId"].properties.$get({
      param: { id, entityType: "feats", entityId },
    });
    await expectStatus(response, 401);
  });

  test("rejects a property without a value", async () => {
    const { id, entityId } = await setup();
    const response = await properties.$post({
      param: { id, entityType: "feats", entityId },
      json: { type: "special" } as never,
    });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset, entity or property", async () => {
    const { id, entityId } = await setup();
    await expectStatus(properties.$get({ param: { id: NIL_UUID, entityType: "feats", entityId } }), 404);
    await expectStatus(properties.$get({ param: { id, entityType: "feats", entityId: NIL_UUID } }), 404);
    const param = { id, entityType: "feats" as const, entityId, propertyId: NIL_UUID };
    await expectStatus(property.$put({ param, json: { value: "missing", type: "test" } }), 404);
    await expectStatus(property.$delete({ param }), 404);
  });
});
