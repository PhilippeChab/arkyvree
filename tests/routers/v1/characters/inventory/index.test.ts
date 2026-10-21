import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { carry } from "@/tests/support/items.ts";
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

  test("reads whether an entry is equipped off its location, and refuses a body that names them at odds", async () => {
    const { id, route } = await openInventory();
    const itemId = (await getSeedCtx()).itemMap["Studded Leather"]!;
    await expectStatus(route.$post({ json: { equipped: true, itemId, quantity: 1 }, param: { id } }), 400);

    const { id: entryId } = await expectOk(route.$post({ json: { itemId, quantity: 1 }, param: { id } }));
    const entry = route[":entryId"];
    await expectStatus(entry.$put({ json: { equipped: true }, param: { entryId, id } }), 400);
    const worn = await expectOk(entry.$put({ json: { force: true, location: "Torso" }, param: { entryId, id } }));
    expect(worn).toMatchObject({ equipped: true, location: "Torso" });
    const kept = await expectOk(entry.$put({ json: { equipped: true, force: true }, param: { entryId, id } }));
    expect(kept).toMatchObject({ equipped: true, location: "Torso" });
    const off = await expectOk(entry.$put({ json: { equipped: false }, param: { entryId, id } }));
    expect(off).toMatchObject({ equipped: false, location: null });
    await expectStatus(entry.$put({ json: { equipped: false, location: "Torso" }, param: { entryId, id } }), 400);
  });

  test("holds an item in a hand in the first weapon set when the body names none", async () => {
    const { id, route } = await openInventory();
    const itemId = (await getSeedCtx()).itemMap.Longsword!;
    const json = { force: true, itemId, location: "Main Hand", quantity: 1 } as const;
    expect(await expectOk(route.$post({ json, param: { id } }))).toMatchObject({ weaponSets: [0] });

    const { id: entryId } = await expectOk(route.$post({ json: { itemId, quantity: 1 }, param: { id } }));
    const json2 = { force: true, location: "Off Hand" } as const;
    const moved = await expectOk(route[":entryId"].$put({ json: json2, param: { entryId, id } }));
    expect(moved).toMatchObject({ location: "Off Hand", weaponSets: [0] });
  });

  test("changes what an edit names of an item forced on, its requirements checked only when it moves", async () => {
    const { id, route } = await openInventory();
    const itemId = (await getSeedCtx()).itemMap["Studded Leather"]!;
    const json = { force: true, itemId, location: "Torso", quantity: 1 } as const;
    const { id: entryId } = await expectOk(route.$post({ json, param: { id } }));

    const entry = route[":entryId"];
    expect(await expectOk(entry.$put({ json: { quantity: 2 }, param: { entryId, id } }))).toMatchObject({
      quantity: 2,
    });
    await expectStatus(entry.$put({ json: { location: "Head" }, param: { entryId, id } }), 400);

    const shield = (await getSeedCtx()).itemMap["Heavy Steel Shield"]!;
    const json2 = { force: true, itemId: shield, location: "Off Hand", quantity: 1, weaponSets: [0, 1] } as const;
    const held = await expectOk(route.$post({ json: { ...json2, weaponSets: [...json2.weaponSets] }, param: { id } }));
    const reordered = { quantity: 2, weaponSets: [1, 0, 1] };
    const changed = await expectOk(route[":entryId"].$put({ json: reordered, param: { entryId: held.id, id } }));
    expect(changed).toMatchObject({ quantity: 2, weaponSets: [0, 1] });

    // An older entry held without a weapon set, which a hand reads as the first
    await carry({ id }, [{ item: "Heavy Steel Shield", location: "Off Hand", weaponSets: [] }]);
    const [stored] = await expectOk(route.$get({ param: { id } }));
    const json3 = { quantity: 2 };
    expect(await expectOk(route[":entryId"].$put({ json: json3, param: { entryId: stored!.id, id } }))).toMatchObject({
      quantity: 2,
      weaponSets: [0],
    });
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
