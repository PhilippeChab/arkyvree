import { describe, expect, test } from "bun:test";

import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { MAX_ITEM_CHARGES, MAX_ITEM_QUANTITY } from "@/shared/characters.ts";
import { expectOk, expectStatus } from "@/tests/support/api.ts";
import { keyedCharacter, listEntities } from "@/tests/support/v1.ts";

/** A new user's key, a character of theirs (`keyedCharacter`), and the kind its sheet's inventory carries. */
async function keyedInventory() {
  const keyed = await keyedCharacter();
  const sheet = await expectOk(keyed.characters.$get({ param: keyed.param }));
  return { ...keyed, carried: sheet.sections.find(({ kind }) => kind === "inventory")?.entityType as string };
}

describe("v1 character inventory", () => {
  test("refuses a quantity or charges past what their columns hold", async () => {
    const { api, carried, character, characters, param } = await keyedInventory();
    const [item] = await listEntities(api, character.rulesetId, carried, { limit: "1" });

    const json = { itemId: item!.id, quantity: MAX_ITEM_QUANTITY + 1 };
    await expectStatus(characters.inventory.$post({ json, param }), 400);

    const charges = { itemId: item!.id, quantity: 1, totalCharges: MAX_ITEM_CHARGES + 1 };
    await expectStatus(characters.inventory.$post({ json: charges, param }), 400);
  });

  test("answers a character's inventory, its items of the kind its sheet carries, and its own modifiers", async () => {
    const { api, carried, character, characters, param, userId } = await keyedInventory();
    const [item] = await listEntities(api, character.rulesetId, carried, { limit: "1" });
    await CharacterInventoryService.addItem({ userId }, character.id, item!.id, 2, null, null, null, [], true);

    expect(await expectOk(characters.inventory.$get({ param }))).toEqual([
      expect.objectContaining({ item: expect.objectContaining({ id: item!.id, name: item!.name }), quantity: 2 }),
    ]);
    expect(await expectOk(characters.modifiers.$get({ param }))).toEqual([]);
  });

  test("adds an item, checks where it's placed, updates it, refusing a stale update, and removes it", async () => {
    const { api, carried, character, characters, param } = await keyedInventory();
    const entities = api.v1.rulesets[":id"].entities[":kind"][":entityId"];
    // An item its rules place somewhere, where it's placed
    let placed;
    for (const { id } of await listEntities(api, character.rulesetId, carried, { limit: "50" })) {
      const item = await expectOk(entities.$get({ param: { entityId: id, id: character.rulesetId, kind: carried } }));
      const [location] = ((item.placement?.locations ?? []) as { grouped: boolean; location: string }[]).filter(
        ({ grouped }) => !grouped,
      );
      if (location) placed = { id, location: location.location };
      if (placed) break;
    }

    const added = await expectOk(characters.inventory.$post({ json: { itemId: placed!.id, quantity: 1 }, param }));
    expect(added).toMatchObject({ item: { id: placed!.id }, quantity: 1 });
    const placement = await expectOk(
      characters.inventory.placement.$get({ param, query: { groups: "", location: placed!.location } }),
    );
    expect(placement).toEqual({ warning: null });

    const entry = { ...param, entryId: added.id };
    const json = { quantity: 3, updatedAt: added.updatedAt };
    expect((await expectOk(characters.inventory[":entryId"].$put({ json, param: entry }))).quantity).toBe(3);
    await expectStatus(characters.inventory[":entryId"].$put({ json: { ...json, quantity: 4 }, param: entry }), 409);
    await expectStatus(characters.inventory[":entryId"].$delete({ param: entry }), 204);
    expect(await expectOk(characters.inventory.$get({ param }))).toEqual([]);
  });
});
