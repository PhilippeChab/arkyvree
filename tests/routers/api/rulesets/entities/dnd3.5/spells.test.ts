import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededForkWithAptitude } from "@/tests/support/dnd3.5/rulesets.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "spells" as const;

describe("rulesets entities: spells", () => {
  test("creates, reads, lists, updates and deletes a spell", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();

    const json = { name: "Test Spell", description: "A test spell", aptitudes: [{ id: aptitudeId, level: 2 }] };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    expect(created).toMatchObject({ name: "Test Spell", description: "A test spell" });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Spell" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { aptitudeId } }));
    expect(list.items.map((p) => p.id)).toEqual([created.id]);

    const updated = await expectOk(
      entity.$put({ param, json: { name: "Renamed Spell", description: "Updated", aptitudes: [] } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Spell", description: "Updated" });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a spell without a name, with malformed aptitudes or a level above 9", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    for (const json of [
      { name: "" },
      { name: "Spell", aptitudes: aptitudeId },
      { name: "Spell", aptitudes: [{ id: aptitudeId, level: 10 }] },
    ])
      await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
  });

  test("returns 404 for a missing ruleset or spell", async () => {
    const { id } = await createSeededForkWithAptitude();
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$get({ param }), 404);
    await expectStatus(entity.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });

  test("refuses a spell in an aptitude that feats already use", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    await expectOk(
      kinds.$post({ param: { id, entityType: "feats" }, json: { name: "Test Feat", aptitudeIds: [aptitudeId] } }),
    );
    const response = await kinds.$post({
      param: { id, entityType },
      json: { name: "Test Spell", aptitudes: [{ id: aptitudeId }] },
    });
    await expectStatus(response, 409);
  });
});
