import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";

const classes = api.api.rulesets[":id"].classes;
const klass = classes[":classId"];

describe("rulesets classes", () => {
  test("creates, reads, lists, updates and deletes a class", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      classes.$post({ param: { id }, json: { name: "Test Class", description: "A test class", hd: 10 } }),
    );
    expect(created).toMatchObject({ name: "Test Class", description: "A test class", hd: 10 });
    const param = { id, classId: created.id };

    expect(await expectOk(klass.$get({ param }))).toMatchObject({ id: created.id, name: "Test Class", hd: 10 });
    const list = await expectOk(classes.$get({ param: { id }, query: { search: "Test Class" } }));
    expect(list.items.map((c) => c.id)).toContain(created.id);

    const updated = await expectOk(
      klass.$put({ param, json: { name: "Renamed Class", description: "Updated", hd: 12 } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Class", description: "Updated", hd: 12 });

    await expectOk(klass.$delete({ param }));
    expect((await klass.$get({ param })).status).toBe(404);
  });

  test("gives a class a d8 hit die by default", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const created = await expectOk(classes.$post({ param: { id }, json: { name: "Default HD Class" } }));
    expect(created.hd).toBe(8);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].classes.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects a class without a name or with a non-standard hit die", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    // Only d4/d6/d8/d10/d12 pass the database's CHECK constraint: the validator stops a d5 first.
    for (const json of [{ name: "" }, { name: "Bad Class", hd: 5 }]) {
      expect((await classes.$post({ param: { id }, json: json as never })).status).toBe(400);
    }
  });

  test("returns 404 for a missing ruleset or class", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await classes.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, classId: NIL_UUID };
    expect((await klass.$get({ param })).status).toBe(404);
    expect((await klass.$put({ param, json: { name: "Missing", hd: 8 } })).status).toBe(404);
    expect((await klass.$delete({ param })).status).toBe(404);
  });
});
