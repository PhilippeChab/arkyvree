import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { api, expectOk, guestApi } from "@/tests/api.ts";
import { createSeededTestRuleset, getSeedCtx } from "@/tests/helpers.ts";

const inventory = api.api.characters.inventory[":characterId"];
const entry = inventory[":itemId"];
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
    expect(await expectOk(added)).toMatchObject({ quantity: 5, equipped: false });
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.itemId)).toContain(itemId);

    const updated = await expectOk(
      entry.$put({
        param: { characterId, itemId },
        json: { ...unequipped, quantity: 10, equipped: true, location: "Trinket" },
      }),
    );
    expect(updated).toMatchObject({ quantity: 10, equipped: true, location: "Trinket" });

    expect(await expectOk(entry.$delete({ param: { characterId, itemId } }))).toEqual({ success: true });
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.itemId)).not.toContain(itemId);
  });

  test("adds an equipped item and an item with charges", async () => {
    const { characterId, itemId } = await setup();
    const equipped = await expectOk(
      inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, equipped: true, location: "Trinket" } }),
    );
    expect(equipped).toMatchObject({ equipped: true, location: "Trinket" });

    await expectOk(entry.$delete({ param: { characterId, itemId } }));
    const charged = await expectOk(
      inventory.$post({
        param: { characterId },
        json: { ...unequipped, itemId, totalCharges: 50, remainingCharges: 50 },
      }),
    );
    expect(charged).toMatchObject({ totalCharges: 50, remainingCharges: 50 });
  });

  test("refuses an item the character already carries", async () => {
    const { characterId, itemId } = await setup();
    await expectOk(inventory.$post({ param: { characterId }, json: { ...unequipped, itemId } }));
    expect((await inventory.$post({ param: { characterId }, json: { ...unequipped, itemId } })).status).toBe(400);
  });

  test("returns 404 for an item the character doesn't carry", async () => {
    const { characterId, itemId } = await setup();
    expect((await entry.$put({ param: { characterId, itemId }, json: unequipped })).status).toBe(404);
    expect((await entry.$delete({ param: { characterId, itemId } })).status).toBe(404);
  });

  test("requires a session", async () => {
    const { characterId, itemId } = await setup();
    const guest = guestApi.api.characters.inventory[":characterId"];
    expect((await guest.$get({ param: { characterId } })).status).toBe(401);
    expect((await guest.$post({ param: { characterId }, json: { ...unequipped, itemId } })).status).toBe(401);
    expect((await guest[":itemId"].$put({ param: { characterId, itemId }, json: unequipped })).status).toBe(401);
    expect((await guest[":itemId"].$delete({ param: { characterId, itemId } })).status).toBe(401);
  });
});
