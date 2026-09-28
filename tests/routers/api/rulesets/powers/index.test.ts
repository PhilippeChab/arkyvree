import { describe, expect, test } from "bun:test";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";

const powers = api.api.rulesets[":id"].powers;
const power = powers[":powerId"];

/** A seeded fork with a new aptitude for its powers. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const aptitude = await expectOk(api.api.rulesets[":id"].aptitudes.$post({ param: { id }, json: { name: "Power Aptitude" } }));
  return { id, aptitudeId: aptitude.id };
}

describe("rulesets powers", () => {
  test("creates, reads, lists, updates and deletes a power", async () => {
    const { id, aptitudeId } = await setup();

    const json = { name: "Test Power", description: "A test power", aptitudes: [{ id: aptitudeId, level: 2 }] };
    const created = await expectOk(powers.$post({ param: { id }, json }));
    expect(created).toMatchObject({ name: "Test Power", description: "A test power" });
    const param = { id, powerId: created.id };

    expect(await expectOk(power.$get({ param }))).toMatchObject({ id: created.id, name: "Test Power" });
    const list = await expectOk(powers.$get({ param: { id }, query: { aptitudeId } }));
    expect(list.items.map((p) => p.id)).toEqual([created.id]);

    const updated = await expectOk(power.$put({ param, json: { name: "Renamed Power", description: "Updated", aptitudes: [] } }));
    expect(updated).toMatchObject({ name: "Renamed Power", description: "Updated" });

    await expectOk(power.$delete({ param }));
    expect((await power.$get({ param })).status).toBe(404);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].powers.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects a power without a name, with malformed aptitudes or a level above 9", async () => {
    const { id, aptitudeId } = await setup();
    for (const json of [
      { name: "" },
      { name: "Power", aptitudes: aptitudeId },
      { name: "Power", aptitudes: [{ id: aptitudeId, level: 10 }] },
    ]) {
      expect((await powers.$post({ param: { id }, json: json as never })).status).toBe(400);
    }
  });

  test("returns 404 for a missing ruleset or power", async () => {
    const { id } = await setup();
    expect((await powers.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, powerId: NIL_UUID };
    expect((await power.$get({ param })).status).toBe(404);
    expect((await power.$put({ param, json: { name: "Missing" } })).status).toBe(404);
    expect((await power.$delete({ param })).status).toBe(404);
  });

  test("refuses a power in an aptitude that feats already use", async () => {
    const { id, aptitudeId } = await setup();
    await expectOk(api.api.rulesets[":id"].feats.$post({ param: { id }, json: { name: "Test Feat", aptitudeIds: [aptitudeId] } }));
    const response = await powers.$post({ param: { id }, json: { name: "Test Spell", aptitudes: [{ id: aptitudeId }] } });
    expect(response.status).toBe(409);
  });
});
