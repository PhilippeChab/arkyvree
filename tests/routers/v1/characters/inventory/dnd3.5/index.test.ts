import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { carry, findPlainItem } from "@/tests/support/dnd3.5/items.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a character of theirs. */
async function keyedCharacter() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const character = await createTestCharacter(user.id);
  return { api, character, characters: api.v1.characters[":id"], param: { id: character.id } };
}

describe("v1 character inventory", () => {
  test("answers a character's inventory, its items' fields by name, and its own modifiers", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const character = await createTestCharacter(user.id);
    const item = await findPlainItem(character.rulesetId);
    await carry(character, [{ item: item.id, quantity: 2 }]);

    const inventory = await expectOk(api.v1.characters[":id"].inventory.$get({ param: { id: character.id } }));
    expect(inventory).toEqual([
      expect.objectContaining({
        charges: null,
        item: expect.objectContaining({ id: item.id, name: item.name }),
        quantity: 2,
      }),
    ]);
    expect(await expectOk(api.v1.characters[":id"].modifiers.$get({ param: { id: character.id } }))).toEqual([]);
  });

  test("adds an item, updates it, refusing a stale update, and removes it", async () => {
    const { character, characters, param } = await keyedCharacter();
    const item = await findPlainItem(character.rulesetId);
    const added = await expectOk(characters.inventory.$post({ json: { itemId: item.id, quantity: 1 }, param }));
    expect(added).toMatchObject({ item: { id: item.id }, quantity: 1 });

    const entry = { ...param, entryId: added.id };
    const updated = await expectOk(
      characters.inventory[":entryId"].$put({ json: { quantity: 3, updatedAt: added.updatedAt }, param: entry }),
    );
    expect(updated.quantity).toBe(3);
    await expectStatus(
      characters.inventory[":entryId"].$put({ json: { quantity: 4, updatedAt: added.updatedAt }, param: entry }),
      409,
    );
    const placement = await expectOk(
      characters.inventory.placement.$get({ param, query: { groups: "", location: "Head" } }),
    );
    expect(placement).toEqual({ warning: null });
    await expectStatus(characters.inventory[":entryId"].$delete({ param: entry }), 204);
    expect(await expectOk(characters.inventory.$get({ param }))).toEqual([]);
  });
});
