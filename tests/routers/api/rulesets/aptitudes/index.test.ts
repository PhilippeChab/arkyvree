import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

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
    await expectStatus(aptitude.$get({ param }), 404);
  });

  test("refuses renaming General, which the rules count on, as an unprocessable entity", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const list = await expectOk(aptitudes.$get({ param: { id }, query: { search: "General" } }));
    const general = list.items.find((a) => a.name === "General");
    const response = await expectStatus(
      aptitude.$put({ param: { id, aptitudeId: general!.id }, json: { name: "General Feats" } }),
      422,
    );
    expect(await response.json()).toMatchObject({ error: "UnprocessableEntityError", cause: "unprocessableEntity" });
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].aptitudes.$get({ param: { id }, query: {} }), 401);
  });

  test("rejects an aptitude without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await aptitudes.$post({ param: { id }, json: { description: "No name" } as never });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset or aptitude", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(aptitudes.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { id, aptitudeId: NIL_UUID };
    await expectStatus(aptitude.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(aptitude.$delete({ param }), 404);
  });
});
