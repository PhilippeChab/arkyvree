import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededForkWithAptitude, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "powers" as const;

describe("rulesets entities: powers", () => {
  test("creates, reads, lists, updates and deletes a power", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();

    const json = { name: "Test Power", description: "A test power", aptitudes: [{ id: aptitudeId, level: 2 }] };
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json }));
    expect(created).toMatchObject({ name: "Test Power", description: "A test power" });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, name: "Test Power" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { aptitudeId } }));
    expect(list.items.map((p) => p.id)).toEqual([created.id]);

    const updated = await expectOk(
      entity.$put({ param, json: { name: "Renamed Power", description: "Updated", aptitudes: [] } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Power", description: "Updated" });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const guestKinds = guestApi.api.rulesets[":id"].entities[":entityType"];
    await expectStatus(guestKinds.$get({ param: { id, entityType }, query: {} }), 401);
  });

  test("rejects a power without a name, with malformed aptitudes or a level above 9", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    for (const json of [
      { name: "" },
      { name: "Power", aptitudes: aptitudeId },
      { name: "Power", aptitudes: [{ id: aptitudeId, level: 10 }] },
    ])
      await expectStatus(kinds.$post({ param: { id, entityType }, json }), 400);
  });

  test("returns 404 for a missing ruleset or power", async () => {
    const { id } = await createSeededForkWithAptitude();
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$get({ param }), 404);
    await expectStatus(entity.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });

  test("refuses a power in an aptitude that feats already use", async () => {
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
