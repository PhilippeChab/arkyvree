import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const items = api.api.rulesets[":id"].items;
const item = items[":itemId"];

describe("rulesets items", () => {
  test("creates, reads, lists, updates and deletes an item", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      items.$post({ param: { id }, json: { name: "Test Item", description: "An item", weight: 2.5, costGp: 150 } }),
    );
    // Numeric columns come back as fixed-point strings.
    expect(created).toMatchObject({ name: "Test Item", description: "An item", weight: "2.50", costGp: "150.00" });
    const param = { id, itemId: created.id };

    expect(await expectOk(item.$get({ param }))).toMatchObject({ id: created.id, weight: "2.50", costGp: "150.00" });
    const list = await expectOk(items.$get({ param: { id }, query: { search: "Test Item" } }));
    expect(list.items.map((i) => i.id)).toContain(created.id);

    const updated = await expectOk(
      item.$put({ param, json: { name: "Renamed Item", description: "Updated", weight: 3.2, costGp: 200 } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Item", description: "Updated", weight: "3.20", costGp: "200.00" });

    await expectOk(item.$delete({ param }));
    await expectStatus(item.$get({ param }), 404);
  });

  test("lists the templates of one type", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const templates = await expectOk(
      api.api.rulesets[":id"].templates.$get({ param: { id }, query: { type: "Shield" } }),
    );
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.type === "Shield" && t.isTemplate)).toBe(true);
  });

  test("refuses the templates of a type no item is based on a template of", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(api.api.rulesets[":id"].templates.$get({ param: { id }, query: { type: "Ring" } }), 400);
  });

  test("duplicates an item under a new name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(
      items.$post({ param: { id }, json: { name: "Duplicate Source", weight: 1, costGp: 5 } }),
    );
    const copy = await expectOk(
      item.duplicate.$post({
        param: { id, itemId: source.id },
        json: { name: "Duplicate Copy", weight: 1, costGp: 5 },
      }),
    );
    expect(copy).toMatchObject({ name: "Duplicate Copy", weight: "1.00", costGp: "5.00" });
    expect(copy.id).not.toBe(source.id);
  });

  test("bulk-creates variants that copy the source's cost and weight", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(
      items.$post({ param: { id }, json: { name: "Bulk Source", costGp: 25, weight: 0.1 } }),
    );
    const created = await expectOk(
      item.variants.$post({
        param: { id, itemId: source.id },
        json: { variants: [{ name: "Bulk Variant A", description: "First" }, { name: "Bulk Variant B" }] },
      }),
    );
    expect(created.map((i) => i.name).sort()).toEqual(["Bulk Variant A", "Bulk Variant B"]);
    expect(created.every((i) => i.costGp === "25.00" && i.weight === "0.10")).toBe(true);
  });

  test("rejects no variant, or more than 50, in one request", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(items.$post({ param: { id }, json: { name: "Bulk Cap Source" } }));
    const variants = Array.from({ length: 51 }, (_, i) => ({ name: `Cap Variant ${i}` }));
    await expectStatus(item.variants.$post({ param: { id, itemId: source.id }, json: { variants } }), 400);
    await expectStatus(item.variants.$post({ param: { id, itemId: source.id }, json: { variants: [] } }), 400);
  });

  test("accepts the updatedAt it returned and refuses it once stale", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const created = await expectOk(items.$post({ param: { id }, json: { name: "CAS Test" } }));
    const param = { id, itemId: created.id };
    const { updatedAt } = await expectOk(item.$get({ param }));

    expect((await item.$put({ param, json: { name: "Edit One", updatedAt } })).status).toBe(200);
    await expectStatus(item.$put({ param, json: { name: "Edit Two", updatedAt } }), 409);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(guestApi.api.rulesets[":id"].items.$get({ param: { id }, query: {} }), 401);
  });

  test("rejects an item without a name or with a non-numeric weight or cost", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    for (const json of [{ name: "" }, { name: "Item", weight: "heavy" }, { name: "Item", costGp: "cheap" }])
      await expectStatus(items.$post({ param: { id }, json: json as never }), 400);
  });

  test("returns 404 for a missing ruleset or item", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(items.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { id, itemId: NIL_UUID };
    await expectStatus(item.$get({ param }), 404);
    await expectStatus(item.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(item.$delete({ param }), 404);
  });
});
