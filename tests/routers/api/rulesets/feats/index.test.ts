import { describe, expect, test } from "bun:test";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";

const feats = api.api.rulesets[":id"].feats;
const feat = feats[":featId"];

/** A seeded fork with a new aptitude for its feats. */
async function setup() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  const aptitude = await expectOk(api.api.rulesets[":id"].aptitudes.$post({ param: { id }, json: { name: "Feat Aptitude" } }));
  return { id, aptitudeId: aptitude.id };
}

describe("rulesets feats", () => {
  test("creates, reads, lists, updates and deletes a feat", async () => {
    const { id, aptitudeId } = await setup();

    const created = await expectOk(feats.$post({ param: { id }, json: { name: "Test Feat", description: "A test feat", aptitudeIds: [aptitudeId] } }));
    expect(created).toMatchObject({ name: "Test Feat", description: "A test feat" });
    const param = { id, featId: created.id };

    expect(await expectOk(feat.$get({ param }))).toMatchObject({ id: created.id, name: "Test Feat" });
    const list = await expectOk(feats.$get({ param: { id }, query: { aptitudeId } }));
    expect(list.items.map((f) => f.id)).toEqual([created.id]);

    const updated = await expectOk(feat.$put({ param, json: { name: "Renamed Feat", description: "Updated", aptitudeIds: [] } }));
    expect(updated).toMatchObject({ name: "Renamed Feat", description: "Updated" });

    await expectOk(feat.$delete({ param }));
    expect((await feat.$get({ param })).status).toBe(404);
  });

  test("groups a feat family's variants into one row", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const grouped = await expectOk(feats.grouped.$get({ param: { id }, query: { search: "Weapon Focus", limit: "100" } }));
    const rows = grouped.items.filter((row) => row.family === "Weapon Focus");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: "Weapon Focus" });
    expect(Number(rows[0].variantCount)).toBeGreaterThan(1);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].feats.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects a feat without a name or an aptitude", async () => {
    const { id, aptitudeId } = await setup();
    for (const json of [{ name: "", aptitudeIds: [aptitudeId] }, { name: "Feat", aptitudeIds: [] }, { name: "Feat", aptitudeIds: aptitudeId }]) {
      expect((await feats.$post({ param: { id }, json: json as never })).status).toBe(400);
    }
  });

  test("returns 404 for a missing ruleset or feat", async () => {
    const { id } = await setup();
    expect((await feats.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, featId: NIL_UUID };
    expect((await feat.$get({ param })).status).toBe(404);
    expect((await feat.$put({ param, json: { name: "Missing" } })).status).toBe(404);
    expect((await feat.$delete({ param })).status).toBe(404);
  });

  test("refuses a feat in an aptitude that spells already use", async () => {
    const { id, aptitudeId } = await setup();
    await expectOk(api.api.rulesets[":id"].powers.$post({ param: { id }, json: { name: "Test Spell", aptitudes: [{ id: aptitudeId }] } }));
    const response = await feats.$post({ param: { id }, json: { name: "Test Feat", aptitudeIds: [aptitudeId] } });
    expect(response.status).toBe(409);
  });
});
