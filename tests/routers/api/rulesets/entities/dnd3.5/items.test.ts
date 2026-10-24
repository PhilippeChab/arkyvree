import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const kinds = api.api.rulesets[":id"].entities[":entityType"];
const entity = kinds[":entityId"];
const entityType = "items" as const;

describe("rulesets entities: items", () => {
  test("creates, reads, lists, updates and deletes an item", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);

    const created = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Item", description: "An item", weight: 2.5, costGp: 150 },
      }),
    );
    // Numeric columns come back as fixed-point strings.
    expect(created).toMatchObject({ name: "Test Item", description: "An item", weight: "2.50", costGp: "150.00" });
    const param = { id, entityType, entityId: created.id };

    expect(await expectOk(entity.$get({ param }))).toMatchObject({ id: created.id, weight: "2.50", costGp: "150.00" });
    const list = await expectOk(kinds.$get({ param: { id, entityType }, query: { search: "Test Item" } }));
    expect(list.items.map((i) => i.id)).toContain(created.id);

    const updated = await expectOk(
      entity.$put({ param, json: { name: "Renamed Item", description: "Updated", weight: 3.2, costGp: 200 } }),
    );
    expect(updated).toMatchObject({ name: "Renamed Item", description: "Updated", weight: "3.20", costGp: "200.00" });

    await expectOk(entity.$delete({ param }));
    await expectStatus(entity.$get({ param }), 404);
  });

  test("clears an item's slot, template, weight and cost with null", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const template = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Blade Template", type: "Weapon", isTemplate: true },
      }),
    );
    const blade = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Blade", type: "Weapon", sourceItemId: template.id, weight: 4, costGp: 15 },
      }),
    );
    const cleared = await expectOk(
      entity.$put({
        param: { id, entityType, entityId: blade.id },
        json: { name: "Test Blade", type: "Weapon", sourceItemId: null, weight: null, costGp: null },
      }),
    );
    expect(cleared).toMatchObject({ sourceItemId: null, weight: null, costGp: null });

    // A slot's none is "Other": worn nowhere in particular
    const hat = await expectOk(kinds.$post({ param: { id, entityType }, json: { name: "Test Hat", slot: "Head" } }));
    expect(
      await expectOk(
        entity.$put({ param: { id, entityType, entityId: hat.id }, json: { name: "Test Hat", slot: null } }),
      ),
    ).toMatchObject({ slot: "Other" });
  });

  test("keeps an edited item's type, whose template's type sets its slot", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const template = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Plate Template", type: "Armor", isTemplate: true },
      }),
    );
    const plate = await expectOk(
      kinds.$post({
        param: { id, entityType },
        json: { name: "Test Plate", type: "Armor", sourceItemId: template.id },
      }),
    );
    expect(plate).toMatchObject({ type: "Armor", slot: "Torso" });
    // An edit that leaves its type out keeps it: an armor is worn on the torso, whatever slot the form gives
    expect(
      await expectOk(
        entity.$put({ param: { id, entityType, entityId: plate.id }, json: { name: "Test Plate", slot: "Head" } }),
      ),
    ).toMatchObject({ type: "Armor", slot: "Torso" });
  });

  test("lists the templates of one type", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const templates = await expectOk(kinds.templates.$get({ param: { id, entityType }, query: { type: "Shield" } }));
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.type === "Shield" && t.isTemplate)).toBe(true);
  });

  test("refuses the templates of a type no item is based on a template of", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.templates.$get({ param: { id, entityType }, query: { type: "Ring" } }), 400);
  });

  test("duplicates an item under a new name", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(
      kinds.$post({ param: { id, entityType }, json: { name: "Duplicate Source", weight: 1, costGp: 5 } }),
    );
    const copy = await expectOk(
      entity.duplicate.$post({
        param: { id, entityType, entityId: source.id },
        json: { name: "Duplicate Copy", weight: 1, costGp: 5 },
      }),
    );
    expect(copy).toMatchObject({ name: "Duplicate Copy", weight: "1.00", costGp: "5.00" });
    expect(copy.id).not.toBe(source.id);
  });

  test("bulk-creates variants that copy the source's cost and weight", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(
      kinds.$post({ param: { id, entityType }, json: { name: "Bulk Source", costGp: 25, weight: 0.1 } }),
    );
    const created = await expectOk(
      entity.variants.$post({
        param: { id, entityType, entityId: source.id },
        json: { variants: [{ name: "Bulk Variant A", description: "First" }, { name: "Bulk Variant B" }] },
      }),
    );
    // Each variant it made, in no particular order
    const copied = { costGp: "25.00", weight: "0.10" };
    expect(created).toHaveLength(2);
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Bulk Variant A", ...copied }),
        expect.objectContaining({ name: "Bulk Variant B", ...copied }),
      ]),
    );
  });

  test("rejects no variant, or more than 50, in one request", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const source = await expectOk(kinds.$post({ param: { id, entityType }, json: { name: "Bulk Cap Source" } }));
    const variants = Array.from({ length: 51 }, (_, i) => ({ name: `Cap Variant ${i}` }));
    await expectStatus(
      entity.variants.$post({ param: { id, entityType, entityId: source.id }, json: { variants } }),
      400,
    );
    await expectStatus(
      entity.variants.$post({ param: { id, entityType, entityId: source.id }, json: { variants: [] } }),
      400,
    );
  });

  test("accepts the updatedAt it returned and refuses it once stale", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    const created = await expectOk(kinds.$post({ param: { id, entityType }, json: { name: "CAS Test" } }));
    const param = { id, entityType, entityId: created.id };
    const { updatedAt } = await expectOk(entity.$get({ param }));

    expect((await entity.$put({ param, json: { name: "Edit One", updatedAt } })).status).toBe(200);
    await expectStatus(entity.$put({ param, json: { name: "Edit Two", updatedAt } }), 409);
  });

  test("refuses a template's type change and delete by the items they reach, naming none of another user's", async () => {
    const author = await createSignedInUser("author");
    const other = await createSignedInUser("other");
    const { id } = await createSeededTestRuleset(author.user.id, { private: false });
    const fork = await createSeededTestRuleset(other.user.id);
    const templates = await expectOk(
      author.api.api.rulesets[":id"].entities[":entityType"].templates.$get({
        param: { id, entityType },
        query: { type: "Weapon" },
      }),
    );
    const sword = templates.find((template) => template.name === "Bastard Sword")!;
    await expectOk(
      other.api.api.rulesets[":id"].entities[":entityType"].$post({
        param: { id: fork.id, entityType },
        json: { name: "Secret Homebrew Blade", type: "Weapon", sourceItemId: sword.id },
      }),
    );
    const authorItem = author.api.api.rulesets[":id"].entities[":entityType"][":entityId"];
    const local = await expectOk(
      authorItem.$put({
        param: { id, entityType, entityId: sword.id },
        json: { name: sword.name, type: "Weapon", description: "Ours" },
      }),
    );
    const param = { id, entityType, entityId: local.id };

    // The other user's fork subscribes: its item, made from the original, reads the author's copy
    await expectOk(author.api.api.rulesets[":id"].publish.$post({ param: { id }, json: { kind: "extension" } }));
    await expectOk(
      other.api.api.rulesets[":id"].subscribe.$post({ param: { id: fork.id }, json: { extensionIds: [id] } }),
    );
    const refused = await expectStatus(authorItem.$put({ param, json: { name: sword.name, type: "Armor" } }), 422);
    expect(await refused.json()).toMatchObject({
      message: `Can't change the Weapon template "Bastard Sword" to Armor while items are made from it: 1 in rulesets built on this one`,
    });
    await expectStatus(authorItem.$delete({ param }), 409);

    // Once it unsubscribes, the author's change reaches no item of its
    await expectOk(
      other.api.api.rulesets[":id"].unsubscribe.$post({ param: { id: fork.id }, json: { extensionId: id } }),
    );
    expect(await expectOk(authorItem.$put({ param, json: { name: sword.name, type: "Armor" } }))).toMatchObject({
      type: "Armor",
    });
    await expectOk(authorItem.$delete({ param }));
  });

  test("requires a session", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(
      guestApi.api.rulesets[":id"].entities[":entityType"].$get({ param: { id, entityType }, query: {} }),
      401,
    );
  });

  test("rejects an item without a name or with a non-numeric weight or cost", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    for (const json of [{ name: "" }, { name: "Item", weight: "heavy" }, { name: "Item", costGp: "cheap" }])
      await expectStatus(kinds.$post({ param: { id, entityType }, json: json as never }), 400);
  });

  test("returns 404 for a missing ruleset or item", async () => {
    const { id } = await createSeededTestRuleset(SEED_USER_ID);
    await expectStatus(kinds.$get({ param: { id: NIL_UUID, entityType }, query: {} }), 404);
    const param = { id, entityType, entityId: NIL_UUID };
    await expectStatus(entity.$get({ param }), 404);
    await expectStatus(entity.$put({ param, json: { name: "Missing" } }), 404);
    await expectStatus(entity.$delete({ param }), 404);
  });
});
