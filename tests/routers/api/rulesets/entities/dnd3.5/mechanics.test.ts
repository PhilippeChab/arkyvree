import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "mechanics" as const;

describe("rulesets entities: mechanics", () => {
  test("creates, reads, lists, updates and deletes a mechanic", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      kinds.$post({ param: { id, entityType }, json: { name: "Test Mechanic", description: "A test mechanic" } }),
    );
    expect(created).toMatchObject({ name: "Test Mechanic", description: "A test mechanic" });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Mechanic" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Mechanic" } }));
    expect(list.items.map((m) => m.id)).toContain(created.id);

    const updated = await expectOk(entity.$put({ param, json: { name: "Renamed Mechanic", description: "Updated" } }));
    expect(updated).toMatchObject({ name: "Renamed Mechanic", description: "Updated" });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a mechanic without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$post({ param: { id, entityType }, json: { name: "" } }), 400);
  });

  test("returns 404 for a missing ruleset or mechanic", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
