import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededForkWithAptitude } from "@/tests/support/dnd3.5/rulesets.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "feats" as const;

describe("rulesets entities: feats", () => {
  test("creates, reads, lists, updates and deletes a feat", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();

    const created = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Feat", description: "A test feat", aptitudeIds: [aptitudeId] },
      }),
    );
    expect(created).toMatchObject({ name: "Test Feat", description: "A test feat" });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Feat" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { aptitudeId } }));
    expect(list.items.map((f) => f.id)).toEqual([created.id]);

    const updated = await expectOk(
      entity.$put({ param, json: { name: "Renamed Feat", description: "Updated", aptitudeIds: [] } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Feat", description: "Updated" });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("groups a feat family's variants into one row", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const grouped = await expectOk(
      kinds.grouped.$get({ param: { id, entityType }, query: { search: "Weapon Focus", limit: "100" } }),
    );
    const rows = grouped.items.filter((row) => row.family === "Weapon Focus");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: "Weapon Focus" });
    expect(Number(rows[0].variantCount)).toBeGreaterThan(1);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a feat without a name or an aptitude", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    for (const json of [
      { name: "", aptitudeIds: [aptitudeId] },
      { name: "Feat", aptitudeIds: [] },
      { name: "Feat", aptitudeIds: aptitudeId },
    ])
      await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
  });

  test("returns 404 for a missing ruleset or feat", async () => {
    const { id } = await createSeededForkWithAptitude();
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$get({ param }), 404);
    await expectStatus(entity.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });

  test("refuses a feat in an aptitude that spells already use", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    await expectOk(
      kinds.$post({
        param: { id, entityType: "spells" },
        json: { name: "Test Spell", aptitudes: [{ id: aptitudeId }] },
      }),
    );
    const response = await kinds.$post({
      param: { id, entityType },
      json: { name: "Test Feat", aptitudeIds: [aptitudeId] },
    });
    await expectStatus(response, 409);
  });
});
