import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { application } from "@/server/routers/application.ts";
import { api, expectOk, guestApi, SEED_SESSION_ID } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";
import { createEntity, CUSTOMIZABLE_ENTITY_TYPES } from "@/tests/routers/api/rulesets/customization/entities.ts";

const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
const modifier = modifiers[":modifierId"];

async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, entityId: await createEntity(id, "feats") };
}

describe("rulesets customization modifiers", () => {
  test("creates, reads, lists, updates, duplicates and deletes a feat modifier", async () => {
    const { id, entityId } = await setup();
    const param = { id, entityType: "feats" as const, entityId };
    expect(await expectOk(modifiers.$get({ param }))).toEqual([]);

    const created = await expectOk(
      modifiers.$post({ param, json: { target: "abilities.strength.misc", value: "2", operator: "add" } }),
    );
    expect(created).toMatchObject({
      target: "abilities.strength.misc",
      value: "2",
      operator: "add",
      valueType: "number",
      sourceType: "feats",
      sourceId: entityId,
    });
    const modifierParam = { ...param, modifierId: created.id };

    expect(await expectOk(modifier.$get({ param: modifierParam }))).toMatchObject({
      id: created.id,
      target: "abilities.strength.misc",
    });
    expect((await expectOk(modifiers.$get({ param }))).map((m) => m.id)).toEqual([created.id]);

    const updated = await expectOk(
      modifier.$put({
        param: modifierParam,
        json: { target: "abilities.constitution.misc", value: "3", operator: "add" },
      }),
    );
    expect(updated).toMatchObject({ target: "abilities.constitution.misc", value: "3" });

    const copy = await expectOk(
      modifier.duplicate.$post({
        param: modifierParam,
        json: { target: "abilities.dexterity.misc", value: "1", operator: "add" },
      }),
    );
    expect(copy).toMatchObject({ target: "abilities.dexterity.misc", sourceId: entityId });
    expect((await expectOk(modifiers.$get({ param }))).map((m) => m.id).sort()).toEqual([created.id, copy.id].sort());

    await expectOk(modifier.$delete({ param: modifierParam }));
    expect((await modifier.$get({ param: modifierParam })).status).toBe(404);
  });

  test.each(CUSTOMIZABLE_ENTITY_TYPES)("adds a modifier to %s", async (entityType) => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = await createEntity(id, entityType);
    const created = await expectOk(
      modifiers.$post({
        param: { id, entityType, entityId },
        json: { target: "combat.hp.misc", value: "5", operator: "add" },
      }),
    );
    expect(created).toMatchObject({ sourceType: entityType, sourceId: entityId });
  });

  test("refuses modifiers as the entity being customized", async () => {
    const { id, entityId } = await setup();
    const body = { target: "abilities.strength.misc", value: "2", operator: "add" };
    const created = await expectOk(modifiers.$post({ param: { id, entityType: "feats", entityId }, json: body }));
    // Only GET accepts `modifiers` as the entity type; the typed client can't build these writes.
    for (const suffix of ["", `/${created.id}/duplicate`]) {
      const response = await application.request(
        `/api/rulesets/${id}/customization/modifiers/${created.id}/modifiers${suffix}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie: `session-id=${SEED_SESSION_ID}` },
          body: JSON.stringify(body),
        },
      );
      expect(response.status).toBe(400);
    }
  });

  test("requires a session", async () => {
    const { id, entityId } = await setup();
    const response = await guestApi.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$get({
      param: { id, entityType: "feats", entityId },
    });
    expect(response.status).toBe(401);
  });

  test("rejects a modifier without a target", async () => {
    const { id, entityId } = await setup();
    const response = await modifiers.$post({
      param: { id, entityType: "feats", entityId },
      json: { value: "2", operator: "add" } as never,
    });
    expect(response.status).toBe(400);
  });

  test("returns 404 for a missing ruleset, entity or modifier", async () => {
    const { id, entityId } = await setup();
    expect((await modifiers.$get({ param: { id: NIL_UUID, entityType: "feats", entityId } })).status).toBe(404);
    expect((await modifiers.$get({ param: { id, entityType: "feats", entityId: NIL_UUID } })).status).toBe(404);
    const param = { id, entityType: "feats" as const, entityId, modifierId: NIL_UUID };
    expect((await modifier.$get({ param })).status).toBe(404);
    expect(
      (await modifier.$put({ param, json: { target: "abilities.wisdom.misc", value: "1", operator: "add" } })).status,
    ).toBe(404);
    expect((await modifier.$delete({ param })).status).toBe(404);
  });
});
