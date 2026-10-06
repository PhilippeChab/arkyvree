import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { application } from "@/server/routers/application.ts";
import { CUSTOMIZABLE_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";
import { createCustomizableFeat, createEntity } from "@/tests/routers/api/rulesets/customization/entities.ts";
import { api, expectOk, expectStatus, guestApi, SEED_SESSION_ID } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
const modifier = modifiers[":modifierId"];

describe("rulesets customization modifiers", () => {
  test("creates, reads, lists, updates, duplicates and deletes a feat modifier", async () => {
    const { id, entityId } = await createCustomizableFeat();
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
    await expectStatus(modifier.$get({ param: modifierParam }), 404);
  });

  test.each([...CUSTOMIZABLE_ENTITY_TYPES])("adds a modifier to %s", async (entityType) => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const entityId = await createEntity(id, entityType);
    const created = await expectOk(
      modifiers.$post({
        param: { id, entityType: getUrlSegment(entityType), entityId },
        json: { target: "combat.hp.misc", value: "5", operator: "add" },
      }),
    );
    expect(created).toMatchObject({ sourceType: entityType, sourceId: entityId });
  });

  test("refuses a value that isn't of its target's type, on create, duplicate and update", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const param = { id, entityType: "feats" as const, entityId };
    const bonus = { target: "abilities.strength.misc", value: "2", operator: "add" };
    await expectStatus(modifiers.$post({ param, json: { ...bonus, value: "+two" } }), 400);
    const created = await expectOk(modifiers.$post({ param, json: bonus }));
    const modifierParam = { ...param, modifierId: created.id };
    await expectStatus(modifier.duplicate.$post({ param: modifierParam, json: { ...bonus, value: "1/2" } }), 400);
    const possessed = { target: "feats.dodge.possessed", value: "True", operator: "set" };
    await expectStatus(modifier.$put({ param: modifierParam, json: possessed }), 400);
    expect(
      await expectOk(modifier.$put({ param: modifierParam, json: { ...possessed, value: "true" } })),
    ).toMatchObject({ value: "true", valueType: "boolean" });
  });

  test("refuses an operator the path doesn't offer, and a pool's slots anything but more or all known", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const param = { id, entityType: "feats" as const, entityId };
    const refused = [
      { target: "feats.dodge.possessed", value: "true", operator: "add" },
      { target: "aptitudes.general.allowed", value: "1", operator: "subtract" },
      { target: "aptitudes.general.allowed", value: "{{ floor([identity.meta.level] / 2) }}", operator: "add" },
      { target: "aptitudes.wizardspells.1.allowed", value: "2", operator: "set" },
      { target: "aptitudes.wizardspells.1.uses", value: "2", operator: "multiply" },
      // -1 is all known: an add takes 0 or more
      { target: "aptitudes.general.allowed", value: "-4", operator: "add" },
      { target: "aptitudes.wizardspells.1.allowed", value: "-1", operator: "add" },
    ];
    for (const json of refused) await expectStatus(modifiers.$post({ param, json }), 400);
    for (const json of [
      { target: "aptitudes.general.allowed", value: "1", operator: "add" },
      { target: "aptitudes.wizardspells.1.allowed", value: "-1", operator: "set" },
    ])
      expect(await expectOk(modifiers.$post({ param, json }))).toMatchObject(json);
  });

  test("takes a modifier on a path from the entities it lists only: a pool's slots from feats, levels and races", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const bonusFeat = { target: "aptitudes.general.allowed", value: "1", operator: "add" };
    const itemId = await createEntity(id, "items");
    await expectStatus(modifiers.$post({ param: { id, entityType: "items", entityId: itemId }, json: bonusFeat }), 400);
    const featId = await createEntity(id, "feats");
    const param = { id, entityType: "feats" as const, entityId: featId };
    expect(await expectOk(modifiers.$post({ param, json: bonusFeat }))).toMatchObject(bonusFeat);
  });

  test("refuses modifiers as the entity being customized", async () => {
    const { id, entityId } = await createCustomizableFeat();
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
      await expectStatus(response, 400);
    }
  });

  test("requires a session", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const response = await guestApi.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$get({
      param: { id, entityType: "feats", entityId },
    });
    await expectStatus(response, 401);
  });

  test("rejects a modifier without a target", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const response = await modifiers.$post({
      param: { id, entityType: "feats", entityId },
      json: { value: "2", operator: "add" } as never,
    });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset, entity or modifier", async () => {
    const { id, entityId } = await createCustomizableFeat();
    await expectStatus(modifiers.$get({ param: { id: NIL_UUID, entityType: "feats", entityId } }), 404);
    await expectStatus(modifiers.$get({ param: { id, entityType: "feats", entityId: NIL_UUID } }), 404);
    const param = { id, entityType: "feats" as const, entityId, modifierId: NIL_UUID };
    await expectStatus(modifier.$get({ param }), 404);
    await expectStatus(
      modifier.$put({ param, json: { target: "abilities.wisdom.misc", value: "1", operator: "add" } }),
      404,
    );
    await expectStatus(modifier.$delete({ param }), 404);
  });
});
