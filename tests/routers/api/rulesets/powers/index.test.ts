import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededForkWithAptitude, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const powers = api.api.rulesets[":id"].powers;
const power = powers[":powerId"];

describe("rulesets powers", () => {
  test("creates, reads, lists, updates and deletes a power", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();

    const json = { name: "Test Power", description: "A test power", aptitudes: [{ id: aptitudeId, level: 2 }] };
    const created = await expectOk(powers.$post({ param: { id }, json }));
    expect(created).toMatchObject({ name: "Test Power", description: "A test power" });
    const param = { id, powerId: created.id };

    expect(await expectOk(power.$get({ param }))).toMatchObject({ id: created.id, name: "Test Power" });
    const list = await expectOk(powers.$get({ param: { id }, query: { aptitudeId } }));
    expect(list.items.map((p) => p.id)).toEqual([created.id]);

    const updated = await expectOk(
      power.$put({ param, json: { name: "Renamed Power", description: "Updated", aptitudes: [] } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Power", description: "Updated" });

    await expectOk(power.$delete({ param }));
    await expectStatus(power.$get({ param }), 404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].powers.$get({ param: { id }, query: {} }), 401);
  });

  test("rejects a power without a name, with malformed aptitudes or a level above 9", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    for (const json of [
      { name: "" },
      { name: "Power", aptitudes: aptitudeId },
      { name: "Power", aptitudes: [{ id: aptitudeId, level: 10 }] },
    ])
      await expectStatus(powers.$post({ param: { id }, json: json as never }), 400);
  });

  test("returns 404 for a missing ruleset or power", async () => {
    const { id } = await createSeededForkWithAptitude();
    await expectStatus(powers.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { id, powerId: NIL_UUID };
    await expectStatus(power.$get({ param }), 404);
    await expectStatus(power.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(power.$delete({ param }), 404);
  });

  test("refuses a power in an aptitude that feats already use", async () => {
    const { id, aptitudeId } = await createSeededForkWithAptitude();
    await expectOk(
      api.api.rulesets[":id"].feats.$post({ param: { id }, json: { name: "Test Feat", aptitudeIds: [aptitudeId] } }),
    );
    const response = await powers.$post({
      param: { id },
      json: { name: "Test Spell", aptitudes: [{ id: aptitudeId }] },
    });
    await expectStatus(response, 409);
  });
});
