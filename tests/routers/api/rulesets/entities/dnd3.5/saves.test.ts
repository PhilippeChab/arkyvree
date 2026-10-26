import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "saves" as const;

describe("rulesets entities: saves", () => {
  test("creates, reads, lists, updates and deletes a save", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const json = { name: "Test Save", description: "A test save", links: { keyAbility: abilityMap["Constitution"] } };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    expect(created).toMatchObject({
      name: json.name,
      description: json.description,
      links: [{ role: "keyAbility", toId: abilityMap["Constitution"], toName: "Constitution" }],
    });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Save" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Save" } }));
    expect(list.items.map((s) => s.id)).toContain(created.id);

    const update = { name: "Renamed Save", description: "Updated", links: { keyAbility: abilityMap["Wisdom"] } };
    expect(await expectOk(entity.$put({ param, json: update }))).toMatchObject({
      name: update.name,
      description: update.description,
      links: [{ role: "keyAbility", toId: abilityMap["Wisdom"], toName: "Wisdom" }],
    });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a save without a name or a valid ability id", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    for (const json of [
      { links: { keyAbility: abilityMap["Wisdom"] } },
      { name: "No ability" },
      { name: "Bad ability", links: { keyAbility: "not-a-uuid" } },
      // Its ability by the old table's column, which no body takes
      { name: "Old ability", abilityId: abilityMap["Wisdom"] },
    ])
      await expectStatus(kinds.$post({ param: { id, entityType }, json: json as never }), 400);
  });

  test("returns 404 for a missing ruleset or save", async () => {
    const { abilityMap } = await getSeedCtx();
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(
      entity.$put({ param, json: { name: "Missing", links: { keyAbility: abilityMap["Wisdom"] } } }),
      404,
    );
    await expectStatus(entity.$delete({ param }), 404);
  });
});
