import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

describe("v1 ruleset items", () => {
  test("lists items, templates or not, and answers one with its cost, its weight and its fields", async () => {
    const { api } = await createKeyedApi();
    const { itemMap, rulesetId: id } = await getSeedCtx();
    const route = api.v1.rulesets[":id"].items;

    const templates = await expectOk(route.$get({ param: { id }, query: { limit: "50", template: "true" } }));
    expect(templates.items.length).toBeGreaterThan(0);
    expect(templates.items.every(({ template }) => template)).toBe(true);
    const made = await expectOk(route.$get({ param: { id }, query: { limit: "50", template: "false" } }));
    expect(made.items.every(({ template }) => !template)).toBe(true);

    const itemId = itemMap.Longsword!;
    const longsword = await expectOk(route[":itemId"].$get({ param: { id, itemId } }));
    expect(longsword).toMatchObject({
      cost: 15,
      id: itemId,
      name: "Longsword",
      template: true,
      type: "Weapon",
      weight: 4,
    });
    expect(longsword.fields).toMatchObject({ weapon: expect.objectContaining({ type: "Longsword" }) });
    await expectStatus(route[":itemId"].$get({ param: { id, itemId: NIL_UUID } }), 404);
  });

  test("lists a ruleset's item templates of a type", async () => {
    const { api } = await createKeyedApi();
    const { rulesetId: id } = await getSeedCtx();
    const weapons = await expectOk(
      api.v1.rulesets[":id"]["item-templates"].$get({ param: { id }, query: { type: "Weapon" } }),
    );
    expect(weapons.map(({ name }) => name)).toContain("Longsword");
    expect(weapons.every(({ template, type }) => template && type === "Weapon")).toBe(true);
  });
});
