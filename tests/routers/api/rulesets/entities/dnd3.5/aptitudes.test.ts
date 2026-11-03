import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "aptitudes" as const;

describe("rulesets entities: aptitudes", () => {
  test("creates, reads, lists, updates and deletes an aptitude", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      kinds.$post({ param: { id, entityType }, json: { name: "Test Aptitude", description: "A test aptitude" } }),
    );
    expect(created).toMatchObject({ name: "Test Aptitude", description: "A test aptitude" });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Aptitude" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Aptitude" } }));
    expect(list.items.map((a) => a.id)).toContain(created.id);

    const updated = await expectOk(entity.$put({ param, json: { name: "Renamed Aptitude", description: "Updated" } }));
    expect(updated).toMatchObject({ name: "Renamed Aptitude", description: "Updated" });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("refuses renaming General, which the rules count on, as an unprocessable entity", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "General" } }));
    const general = list.items.find((a) => a.name === "General");
    const response = await expectStatus(
      entity.$put({ param: { id, entityType, entityId: general!.id }, json: { name: "General Feats" } }),
      422,
    );
    expect(await response.json()).toMatchObject({ error: "UnprocessableEntityError", cause: "unprocessableEntity" });
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects an aptitude without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await kinds.$post({ param: { id, entityType }, json: { description: "No name" } as never });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset or aptitude", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
