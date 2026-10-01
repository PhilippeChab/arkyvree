import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";

const aptitudes = api.api.rulesets[":id"].aptitudes;
const aptitude = aptitudes[":aptitudeId"];

describe("rulesets aptitudes", () => {
  test("creates, reads, lists, updates and deletes an aptitude", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      aptitudes.$post({ param: { id }, json: { name: "Test Aptitude", description: "A test aptitude" } }),
    );
    expect(created).toMatchObject({ name: "Test Aptitude", description: "A test aptitude" });
    const param = { id, aptitudeId: created.id };

    expect(await expectOk(aptitude.$get({ param }))).toMatchObject({ id: created.id, name: "Test Aptitude" });
    const list = await expectOk(aptitudes.$get({ param: { id }, query: { search: "Test Aptitude" } }));
    expect(list.items.map((a) => a.id)).toContain(created.id);

    const updated = await expectOk(
      aptitude.$put({ param, json: { name: "Renamed Aptitude", description: "Updated" } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Aptitude", description: "Updated" });

    await expectOk(aptitude.$delete({ param }));
    expect((await aptitude.$get({ param })).status).toBe(404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].aptitudes.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects an aptitude without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await aptitudes.$post({ param: { id }, json: { description: "No name" } as never });
    expect(response.status).toBe(400);
  });

  test("returns 404 for a missing ruleset or aptitude", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await aptitudes.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, aptitudeId: NIL_UUID };
    expect((await aptitude.$put({ param, json: { name: "Missing" } })).status).toBe(404);
    expect((await aptitude.$delete({ param })).status).toBe(404);
  });
});
