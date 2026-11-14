import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { NameBindings } from "@/server/repositories/index.ts";
import { createCustomizableFeat, createEntity } from "@/tests/routers/api/rulesets/customization/dnd3.5/entities.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

const charisma13 = { level: "1", target: "abilities.charisma.total", value: "13", operator: "greater_than_or_equal" };
const customization = api.api.rulesets[":id"].customization[":entityType"][":entityId"];
const requirements = customization.requirements;
const requirement = requirements[":requirementId"];

describe("rulesets customization requirements", () => {
  test("creates, lists, updates and deletes a feat requirement", async () => {
    const { id, entityId } = await createCustomizableFeat();
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

  test.each([...Engine.forRules(DND35_BASE_RULES).storage().customizableKinds()])(
    "adds a requirement to %s",
    async (entityType) => {
      const { id } = await createSeededTestRuleset(SEED_USER_ID);
      const entityId = await createEntity(id, entityType);
      const created = await expectOk(requirements.$post({ param: { id, entityType, entityId }, json: charisma13 }));
      expect(created).toMatchObject({ entityType, entityId });
    },
  );

  test("adds a requirement to a modifier", async () => {
    const { id, entityId } = await createCustomizableFeat();
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

  test("rejects a value that isn't of its target's type", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const param = { id, entityType: "feats" as const, entityId };
    await expectStatus(requirements.$post({ param, json: { ...charisma13, value: "high" } }), 400);
    const dodge = { level: "1", target: "feats.dodge.possessed", operator: "equal" };
    await expectStatus(requirements.$post({ param, json: { ...dodge, value: "yes" } }), 400);
    const created = await expectOk(requirements.$post({ param, json: { ...dodge, value: "false" } }));
    expect(created).toMatchObject({ value: "false", valueType: "boolean" });
    const requirementParam = { ...param, requirementId: created.id };
    await expectStatus(requirement.$put({ param: requirementParam, json: { ...dodge, value: "no" } }), 400);
    // A new target without a value keeps the stored one, which must suit it: false isn't a number
    const { value: _value, ...charismaWithoutValue } = charisma13;
    await expectStatus(requirement.$put({ param: requirementParam, json: charismaWithoutValue }), 400);
  });

  test("turns a condition into a group and back, its names going with its condition", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const param = { id, entityType: "feats" as const, entityId };
    const dodge = { level: "1", target: "feats.dodge.possessed", operator: "equal", value: "true" };
    const created = await expectOk(requirements.$post({ param, json: dodge }));
    const requirementParam = { ...param, requirementId: created.id };
    const bound = () => NameBindings.findMany(db, { modifierIds: [], requirementIds: [created.id] });
    expect(await bound()).not.toEqual([]);

    const group = await expectOk(
      requirement.$put({
        param: requirementParam,
        json: { level: "1", chainingOperator: "or", updatedAt: created.updatedAt },
      }),
    );
    expect(group).toMatchObject({ chainingOperator: "or", target: null, operator: null, value: null, valueType: null });
    expect(await bound()).toEqual([]);

    const condition = await expectOk(
      requirement.$put({ param: requirementParam, json: { ...charisma13, updatedAt: group.updatedAt } }),
    );
    expect(condition).toMatchObject({ ...charisma13, valueType: "number", chainingOperator: null });
  });

  test("refuses turning a group into a condition while requirements sit under it", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const param = { id, entityType: "feats" as const, entityId };
    const group = await expectOk(requirements.$post({ param, json: { level: "1", chainingOperator: "and" } }));
    await expectOk(requirements.$post({ param, json: { ...charisma13, level: "1.1" } }));

    const turned = requirement.$put({ param: { ...param, requirementId: group.id }, json: charisma13 });
    expect(await (await expectStatus(turned, 409)).json()).toMatchObject({
      message: "A group with requirements under it can't become a condition: delete the requirements under it first",
    });
    expect((await expectOk(requirements.$get({ param }))).find((row) => row.id === group.id)).toMatchObject({
      chainingOperator: "and",
      target: null,
    });
  });

  test("rejects a requirement without a level", async () => {
    const { id, entityId } = await createCustomizableFeat();
    const { level: _level, ...withoutLevel } = charisma13;
    const response = await requirements.$post({
      param: { id, entityType: "feats", entityId },
      json: withoutLevel as never,
    });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset, entity or requirement", async () => {
    const { id, entityId } = await createCustomizableFeat();
    await expectStatus(requirements.$get({ param: { id: NIL_UUID, entityType: "feats", entityId } }), 404);
    await expectStatus(requirements.$get({ param: { id, entityType: "feats", entityId: NIL_UUID } }), 404);
    // A missing modifier, named in its rules' word
    const onModifier = requirements.$post({
      param: { id, entityType: "modifiers", entityId: NIL_UUID },
      json: charisma13,
    });
    expect(await (await expectStatus(onModifier, 404)).json()).toMatchObject({ message: "Modifier not found" });
    const param = { id, entityType: "feats" as const, entityId, requirementId: NIL_UUID };
    // A missing requirement named in the engine's word for it
    expect(await (await expectStatus(requirement.$put({ param, json: charisma13 }), 404)).json()).toMatchObject({
      message: "Requirement not found for this entity",
    });
    await expectStatus(requirement.$delete({ param }), 404);
  });
});
