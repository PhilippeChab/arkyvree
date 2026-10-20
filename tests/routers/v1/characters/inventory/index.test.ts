import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { findPlainItem, findSeededCharacter, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's character, and the routes of its inventory, as the user's key reads them. */
async function openInventory() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { id } = await createTestCharacter(user.id);
  return { api, id, route: api.v1.characters[":id"].inventory };
}

describe("v1 character inventory", () => {
  test("answers a character's inventory: each item it carries, where, and how many", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const inventory = await expectOk(api.v1.characters[":id"].inventory.$get({ param: { id } }));
    expect(inventory).toContainEqual({
      charges: null,
      equipped: true,
      id: expect.any(String),
      item: { id: expect.any(String), name: "Longbow", slot: "Other", type: "Weapon", weight: 3 },
      location: "Two Handed",
      locationLabel: "Two Handed (Set 1)",
      quantity: 1,
      weaponSets: [0],
    });
  });

  test("adds an item to a character's inventory, changes it and removes it", async () => {
    const { id, route } = await openInventory();
    const { rulesetId } = await getSeedCtx();
    const item = await findPlainItem(rulesetId);

    const added = await expectOk(route.$post({ json: { itemId: item.id, quantity: 2 }, param: { id } }));
    expect(added).toMatchObject({
      equipped: false,
      item: { id: item.id, name: item.name },
      location: null,
      quantity: 2,
    });
    expect(await expectOk(route.$get({ param: { id } }))).toEqual([added]);

    const entryId = added.id;
    const changed = await expectOk(route[":entryId"].$put({ json: { quantity: 3 }, param: { entryId, id } }));
    expect(changed).toMatchObject({ id: entryId, quantity: 3 });

    await expectStatus(route[":entryId"].$delete({ param: { entryId, id } }), 204);
    expect(await expectOk(route.$get({ param: { id } }))).toEqual([]);
  });

  test("changes only what an update names of an entry: where it's equipped and its charges are kept", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const route = api.v1.characters[":id"].inventory;
    const bow = (await expectOk(route.$get({ param: { id } }))).find(({ item }) => item.name === "Longbow")!;

    const changed = await expectOk(route[":entryId"].$put({ json: { quantity: 2 }, param: { entryId: bow.id, id } }));
    expect(changed).toEqual({ ...bow, quantity: 2 });
  });

  test("says why a place can't take one more item, and refuses an add there", async () => {
    const { api } = await createKeyedApi();
    const { itemMap } = await getSeedCtx();
    const { id } = await findSeededCharacter("Fenn Ashwalker");
    const route = api.v1.characters[":id"].inventory;
    // Fenn already wears studded leather
    const armor = { equipped: true, itemId: itemMap["Studded Leather"]!, location: "Torso", quantity: 1 } as const;

    const placement = await expectOk(route.placement.$get({ param: { id }, query: { location: "Torso" } }));
    expect(placement.warning).toBe("Torso slot is occupied by Studded Leather");
    await expectStatus(route.$post({ json: armor, param: { id } }), 400);
    expect((await expectOk(route.placement.$get({ param: { id }, query: { location: "Head" } }))).warning).toBeNull();
  });

  test("equips an item whose requirements the character doesn't meet only when it's forced", async () => {
    const { id, route } = await openInventory();
    const { itemMap } = await getSeedCtx();
    // A new character has no armor proficiency
    const armor = { equipped: true, itemId: itemMap["Studded Leather"]!, location: "Torso", quantity: 1 } as const;
    await expectStatus(route.$post({ json: armor, param: { id } }), 400);
    expect(await expectOk(route.$post({ json: { ...armor, force: true }, param: { id } }))).toMatchObject({
      equipped: true,
      location: "Torso",
    });
  });

  test("refuses another user's character, and an entry it doesn't have", async () => {
    const { id, route } = await openInventory();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    await expectStatus(api.v1.characters[":id"].inventory.$get({ param: { id } }), 404);
    await expectStatus(route[":entryId"].$delete({ param: { entryId: NIL_UUID, id } }), 404);
  });
});
