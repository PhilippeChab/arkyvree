import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, NIL_UUID } from "@/tests/helpers.ts";

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
    expect((await item.$get({ param })).status).toBe(404);
  });

  test("lists the templates of one type", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const templates = await expectOk(
      api.api.rulesets[":id"].templates.$get({ param: { id }, query: { type: "Shield" } }),
    );
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.type === "Shield" && t.isTemplate)).toBe(true);
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

  test("rejects more than 50 variants in one request", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(items.$post({ param: { id }, json: { name: "Bulk Cap Source" } }));
    const variants = Array.from({ length: 51 }, (_, i) => ({ name: `Cap Variant ${i}` }));
    expect((await item.variants.$post({ param: { id, itemId: source.id }, json: { variants } })).status).toBe(400);
  });

  test("accepts the updatedAt it returned and refuses it once stale", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const created = await expectOk(items.$post({ param: { id }, json: { name: "CAS Test" } }));
    const param = { id, itemId: created.id };
    const { updatedAt } = await expectOk(item.$get({ param }));

    expect((await item.$put({ param, json: { name: "Edit One", updatedAt } })).status).toBe(200);
    expect((await item.$put({ param, json: { name: "Edit Two", updatedAt } })).status).toBe(409);
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await guestApi.api.rulesets[":id"].items.$get({ param: { id }, query: {} })).status).toBe(401);
  });

  test("rejects an item without a name or with a non-numeric weight or cost", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    for (const json of [{ name: "" }, { name: "Item", weight: "heavy" }, { name: "Item", costGp: "cheap" }]) {
      expect((await items.$post({ param: { id }, json: json as never })).status).toBe(400);
    }
  });

  test("returns 404 for a missing ruleset or item", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    expect((await items.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { id, itemId: NIL_UUID };
    expect((await item.$get({ param })).status).toBe(404);
    expect((await item.$put({ param, json: { name: "Missing" } })).status).toBe(404);
    expect((await item.$delete({ param })).status).toBe(404);
  });
});
