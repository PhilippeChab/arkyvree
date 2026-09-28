import { describe, expect, test } from "bun:test";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";

const mechanics = api.api.rulesets[":id"].mechanics;
const mechanic = mechanics[":mechanicId"];

describe("rulesets mechanics", () => {
  test("creates, reads, lists, updates and deletes a mechanic", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(mechanics.$post({ param: { id }, json: { name: "Test Mechanic", description: "A test mechanic" } }));
    expect(created).toMatchObject({ name: "Test Mechanic", description: "A test mechanic" });
    const param = { id, mechanicId: created.id };

    expect(await expectOk(mechanic.$get({ param }))).toMatchObject({ id: created.id, name: "Test Mechanic" });
    const list = await expectOk(mechanics.$get({ param: { id }, query: { search: "Test Mechanic" } }));
    expect(list.items.map((m) => m.id)).toContain(created.id);

    const updated = await expectOk(mechanic.$put({ param, json: { name: "Renamed Mechanic", description: "Updated" } }));
    expect(updated).toMatchObject({ name: "Renamed Mechanic", description: "Updated" });

    await expectOk(mechanic.$delete({ param }));
    expect((await mechanic.$get({ param })).status).toBe(404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].mechanics.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects a mechanic without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await mechanics.$post({ param: { id }, json: { name: "" } })).status).toBe(400);
  });

  test("returns 404 for a missing ruleset or mechanic", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await mechanics.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, mechanicId: NIL_UUID };
    expect((await mechanic.$put({ param, json: { name: "Missing" } })).status).toBe(404);
    expect((await mechanic.$delete({ param })).status).toBe(404);
  });
});
