import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "races" as const;

describe("rulesets entities: races", () => {
  test("creates, reads, lists, updates and deletes a race", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = { name: "Test Race", description: "A test race", size: "Medium", baseSpeed: 30 };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    expect(created).toMatchObject(json);
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Race" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Race" } }));
    expect(list.items.map((r) => r.id)).toContain(created.id);

    const update = { name: "Renamed Race", description: "Updated", size: "Large", baseSpeed: 40 };
    expect(await expectOk(entity.$put({ param, json: update }))).toMatchObject(update);

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
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
      await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
  });

  test("returns 404 for a missing ruleset or race", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$put({ param, json: { name: "Missing", size: "Medium", baseSpeed: 30 } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
