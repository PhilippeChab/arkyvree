import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const languages = api.api.rulesets[":id"].languages;
const language = languages[":languageId"];

describe("rulesets languages", () => {
  test("creates, reads, lists, updates and deletes a language", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = { name: "Test Language", description: "A test language", type: "Common" };
    const created = await expectOk(languages.$post({ param: { id }, json }));
    expect(created).toMatchObject(json);
    const param = { id, languageId: created.id };

    expect(await expectOk(language.$get({ param }))).toMatchObject({ id: created.id, ...json });
    const list = await expectOk(languages.$get({ param: { id }, query: { search: "Test Language" } }));
    expect(list.items.map((l) => l.id)).toContain(created.id);

    const update = { name: "Renamed Language", description: "Updated", type: "Exotic" };
    expect(await expectOk(language.$put({ param, json: update }))).toMatchObject(update);

    await expectOk(language.$delete({ param }));
    await expectStatus(language.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].languages.$get({ param: { id }, query: {} }), 401);
  });

  test("rejects a language without a name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const response = await languages.$post({ param: { id }, json: { type: "Common" } as never });
    await expectStatus(response, 400);
  });

  test("returns 404 for a missing ruleset or language", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(languages.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { id, languageId: NIL_UUID };
    await expectStatus(language.$put({ param, json: { name: "Missing", type: "Common" } }), 404);
    await expectStatus(language.$delete({ param }), 404);
  });
});
