import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createKeyedFork } from "@/tests/support/rulesets.ts";
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

  test("adds an item to a user's ruleset, changes one it inherits on a copy of its own, and deletes one", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].items;

    const created = await expectOk(
      route.$post({ json: { cost: 5, name: "Lucky Coin", type: "Other", weight: 0.5 }, param: { id } }),
    );
    expect(created).toMatchObject({
      cost: 5,
      name: "Lucky Coin",
      template: false,
      templateId: null,
      type: "Other",
      weight: 0.5,
    });

    const itemId = ctx.itemMap.Longsword!;
    const changed = await expectOk(route[":itemId"].$put({ json: { name: "Arming Sword" }, param: { id, itemId } }));
    expect(changed).toMatchObject({ name: "Arming Sword", type: "Weapon" });
    expect(changed.id).not.toBe(itemId);

    await expectStatus(route[":itemId"].$delete({ param: { id, itemId: created.id } }), 204);
    await expectStatus(route[":itemId"].$get({ param: { id, itemId: created.id } }), 404);
  });

  test("keeps the slot an item's type sets when its update names another without its type", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const itemId = (await getSeedCtx()).itemMap["Studded Leather"]!;
    const route = api.v1.rulesets[":id"].items[":itemId"];

    const changed = await expectOk(
      route.$put({ json: { name: "Studded Jerkin", slot: "Head" }, param: { id, itemId } }),
    );
    expect(changed).toMatchObject({ slot: "Torso", type: "Armor" });
  });

  test("refuses to change a ruleset the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const ctx = await getSeedCtx();
    const id = ctx.rulesetId;
    await expectStatus(
      api.v1.rulesets[":id"].items.$post({
        json: { cost: 5, name: "Lucky Coin", type: "Other", weight: 0.5 },
        param: { id },
      }),
      403,
    );
  });

  test("answers an item with no cost or weight as none, never 0", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const items = api.v1.rulesets[":id"].items;
    const rope = await expectOk(
      items.$post({ json: { cost: null, name: "Old Rope", type: "Other", weight: null }, param: { id } }),
    );
    expect(rope).toMatchObject({ cost: null, weight: null });
    expect(await expectOk(items[":itemId"].$get({ param: { id, itemId: rope.id } }))).toEqual(rope);
  });

  test("adds a copy of an item, and the variants of a template", async () => {
    const { api, rulesetId: id } = await createKeyedFork();
    const ctx = await getSeedCtx();
    const route = api.v1.rulesets[":id"].items[":itemId"];
    const itemId = ctx.itemMap.Longsword!;

    const copy = await expectOk(
      route.duplicate.$post({ json: { cost: 15, name: "Longsword (Copy)", type: "Weapon" }, param: { id, itemId } }),
    );
    expect(copy).toMatchObject({ cost: 15, name: "Longsword (Copy)", type: "Weapon" });
    const variants = await expectOk(
      route.variants.$post({
        json: { variants: [{ name: "Longsword +1" }, { name: "Longsword +2" }] },
        param: { id, itemId },
      }),
    );
    expect(variants.map(({ name, templateId }) => ({ name, templateId }))).toEqual([
      { name: "Longsword +1", templateId: itemId },
      { name: "Longsword +2", templateId: itemId },
    ]);
    // Each answered as its read answers it, with the fields it takes from its template
    expect(variants[0]?.fields).toMatchObject({ weapon: expect.objectContaining({ type: "Longsword" }) });
    expect(variants[0]).toEqual(await expectOk(route.$get({ param: { id, itemId: variants[0]!.id } })));
  });
});
