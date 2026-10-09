import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const races = api.api.rulesets[":id"].races;
const race = races[":raceId"];

describe("rulesets races", () => {
  test("creates, reads, lists, updates and deletes a race", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = { name: "Test Race", description: "A test race", size: "Medium" as const, baseSpeed: 30 };
    const created = await expectOk(races.$post({ param: { id }, json }));
    expect(created).toMatchObject(json);
    const param = { id, raceId: created.id };

    expect(await expectOk(race.$get({ param }))).toMatchObject({ id: created.id, name: "Test Race" });
    const list = await expectOk(races.$get({ param: { id }, query: { search: "Test Race" } }));
    expect(list.items.map((r) => r.id)).toContain(created.id);

    const update = { name: "Renamed Race", description: "Updated", size: "Large" as const, baseSpeed: 40 };
    expect(await expectOk(race.$put({ param, json: update }))).toMatchObject(update);

    await expectOk(race.$delete({ param }));
    await expectStatus(race.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].races.$get({ param: { id }, query: {} }), 401);
  });

  test("rejects a race without a name, with an unknown size, or a speed that isn't a whole number above 0", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const valid = { name: "Race", size: "Medium", baseSpeed: 30 };
    for (const json of [
      { ...valid, name: "" },
      { ...valid, size: "Colossal-ish" },
      { ...valid, baseSpeed: "fast" },
      { ...valid, baseSpeed: 0 },
      { ...valid, baseSpeed: 7.5 },
    ])
      await expectStatus(races.$post({ param: { id }, json: json as never }), 400);
  });

  test("returns 404 for a missing ruleset or race", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(races.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { id, raceId: NIL_UUID };
    await expectStatus(race.$put({ param, json: { name: "Missing", size: "Medium", baseSpeed: 30 } }), 404);
    await expectStatus(race.$delete({ param }), 404);
  });
});
