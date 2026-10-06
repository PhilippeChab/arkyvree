import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const mechanics = api.api.rulesets[":id"].mechanics;
const mechanic = mechanics[":mechanicId"];

describe("rulesets mechanics", () => {
  test("creates, reads, lists, updates and deletes a mechanic", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      mechanics.$post({ param: { id }, json: { name: "Test Mechanic", description: "A test mechanic" } }),
    );
    expect(created).toMatchObject({ name: "Test Mechanic", description: "A test mechanic" });
    const param = { id, mechanicId: created.id };

    expect(await expectOk(mechanic.$get({ param }))).toMatchObject({ id: created.id, name: "Test Mechanic" });
    const list = await expectOk(mechanics.$get({ param: { id }, query: { search: "Test Mechanic" } }));
    expect(list.items.map((m) => m.id)).toContain(created.id);

    const updated = await expectOk(
      mechanic.$put({ param, json: { name: "Renamed Mechanic", description: "Updated" } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Mechanic", description: "Updated" });

    await expectOk(mechanic.$delete({ param }));
    await expectStatus(mechanic.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].mechanics.$get({ param: { id }, query: {} }), 401);
  });

  test("rejects a mechanic without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(mechanics.$post({ param: { id }, json: { name: "" } }), 400);
  });

  test("returns 404 for a missing ruleset or mechanic", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(mechanics.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { id, mechanicId: NIL_UUID };
    await expectStatus(mechanic.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(mechanic.$delete({ param }), 404);
  });
});
