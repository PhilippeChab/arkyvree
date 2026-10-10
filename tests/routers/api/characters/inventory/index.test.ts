import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

const inventory = api.api.characters.inventory[":characterId"];
const entry = inventory[":entryId"];
const unequipped = { quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null };

/** A character in a seeded fork, and an item of that fork it doesn't carry yet. */
async function setup() {
  const ctx = await getSeedCtx();
  const { id: rulesetId } = await createSeededTestRuleset(SEED_USER_ID);
  const item = await expectOk(
    api.api.rulesets[":id"].items.$post({
      param: { id: rulesetId },
      json: { name: "Inventory Item", weight: 5, costGp: 10 },
    }),
  );
  const abilities = Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10]));
  const character = await expectOk(
    api.api.characters.$post({
      json: {
        rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Inventory Character",
        xp: 0,
        alignment: "True Neutral",
        abilities,
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
      },
    }),
  );
  return { characterId: character.id, itemId: item.id };
}

describe("character inventory", () => {
  test("adds, lists, updates and removes an item", async () => {
    const { characterId, itemId } = await setup();

    const added = await inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, quantity: 5 } });
    expect(added.status).toBe(201);
    const { id: entryId, ...addedEntry } = await expectOk(added);
    expect(addedEntry).toMatchObject({ quantity: 5, equipped: false });
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.itemId)).toContain(itemId);

    const updated = await expectOk(
      entry.$put({
        param: { characterId, entryId },
        json: { ...unequipped, quantity: 10, equipped: true, location: "Trinket" },
      }),
    );
    expect(updated).toMatchObject({ quantity: 10, equipped: true, location: "Trinket" });

    expect(await expectOk(entry.$delete({ param: { characterId, entryId } }))).toEqual({ success: true });
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.itemId)).not.toContain(itemId);
  });

  test("adds an equipped item and an item with charges", async () => {
    const { characterId, itemId } = await setup();
    const equipped = await expectOk(
      inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, equipped: true, location: "Trinket" } }),
    );
    expect(equipped).toMatchObject({ equipped: true, location: "Trinket" });

    await expectOk(entry.$delete({ param: { characterId, entryId: equipped.id } }));
    const charged = await expectOk(
      inventory.$post({
        param: { characterId },
        json: { ...unequipped, itemId, totalCharges: 50, remainingCharges: 50 },
      }),
    );
    expect(charged).toMatchObject({ totalCharges: 50, remainingCharges: 50 });
  });

  test("adds an item the character already carries as another entry: a second one, placed apart", async () => {
    const { characterId, itemId } = await setup();
    const first = await expectOk(inventory.$post({ param: { characterId }, json: { ...unequipped, itemId } }));
    const second = await expectOk(inventory.$post({ param: { characterId }, json: { ...unequipped, itemId } }));
    expect(second.id).not.toBe(first.id);
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
  });

  test("answers what keeps a slot from taking an item, the edited entry aside", async () => {
    const { characterId, itemId } = await setup();
    const placement = inventory.placement;
    const held = await expectOk(
      inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, equipped: true, location: "Head" } }),
    );
    expect(
      await expectOk(placement.$get({ param: { characterId }, query: { location: "Head", weaponSet: "0" } })),
    ).toEqual({ warning: "Head slot is occupied by Inventory Item" });
    expect(
      await expectOk(
        placement.$get({ param: { characterId }, query: { location: "Head", weaponSet: "0", entryId: held.id } }),
      ),
    ).toEqual({ warning: null });
  });

  test("returns 404 for an entry the character doesn't have", async () => {
    const { characterId, itemId } = await setup();
    await expectStatus(entry.$put({ param: { characterId, entryId: itemId }, json: unequipped }), 404);
    await expectStatus(entry.$delete({ param: { characterId, entryId: itemId } }), 404);
  });

  test("requires a session", async () => {
    const { characterId, itemId } = await setup();
    const guest = guestApi.api.characters.inventory[":characterId"];
    await expectStatus(guest.$get({ param: { characterId } }), 401);
    await expectStatus(
      guest.placement.$get({ param: { characterId }, query: { location: "Head", weaponSet: "0" } }),
      401,
    );
    await expectStatus(guest.$post({ param: { characterId }, json: { ...unequipped, itemId } }), 401);
    await expectStatus(guest[":entryId"].$put({ param: { characterId, entryId: itemId }, json: unequipped }), 401);
    await expectStatus(guest[":entryId"].$delete({ param: { characterId, entryId: itemId } }), 401);
  });
});
