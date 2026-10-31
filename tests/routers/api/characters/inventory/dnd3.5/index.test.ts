import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { ITEM_COST_GP, ITEM_HAS_CHARGES, ITEM_WEIGHT } from "@/vocabulary/dnd3.5/fields/index.ts";

const inventory = api.api.characters.inventory[":characterId"];
const entry = inventory[":entryId"];
const unequipped = { quantity: 1, location: null, totalCharges: null, remainingCharges: null };

/** A character in a seeded fork, and an item of that fork it doesn't carry yet, which comes with charges. */
async function setup() {
  const ctx = await getSeedCtx();
  const { id: rulesetId } = await createSeededTestRuleset(SEED_USER_ID);
  const item = await expectOk(
    api.api.rulesets[":id"].entities[":entityType"].$post({
      param: { id: rulesetId, entityType: "items" },
      json: { name: "Inventory Item", fields: { [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 10, [ITEM_HAS_CHARGES]: 50 } },
    }),
  );
  const abilities = Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10]));
  const character = await expectOk(
    api.api.characters.$post({
      json: {
        rulesetId,
        picks: { race: ctx.raceMap.pc["Human"] },
        scores: { score: abilities },
        name: "Inventory Character",
        fields: {
          CHARACTER_XP: 0,
          CHARACTER_ALIGNMENT: "True Neutral",
          CHARACTER_AGE: 25,
          CHARACTER_GENDER: "Male",
          CHARACTER_HEIGHT: "180",
          CHARACTER_WEIGHT: "80",
        },
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
    expect(addedEntry).toMatchObject({ quantity: 5, location: null });
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.itemId)).toContain(itemId);

    const updated = await expectOk(
      entry.$put({
        param: { characterId, entryId },
        json: { ...unequipped, quantity: 10, location: "Trinket" },
      }),
    );
    expect(updated).toMatchObject({ quantity: 10, location: "Trinket" });

    expect(await expectOk(entry.$delete({ param: { characterId, entryId } }))).toEqual({ success: true });
    expect((await expectOk(inventory.$get({ param: { characterId } }))).map((e) => e.itemId)).not.toContain(itemId);
  });

  test("adds an equipped item and an item with charges", async () => {
    const { characterId, itemId } = await setup();
    const equipped = await expectOk(
      inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, location: "Trinket" } }),
    );
    expect(equipped).toMatchObject({ location: "Trinket" });

    await expectOk(entry.$delete({ param: { characterId, entryId: equipped.id } }));
    const charged = await expectOk(
      inventory.$post({
        param: { characterId },
        json: { ...unequipped, itemId, totalCharges: 50, remainingCharges: 50 },
      }),
    );
    expect(charged).toMatchObject({ totalCharges: 50, remainingCharges: 50 });
  });

  test("lists the items in the sheet's inventory block, each in its units, with the load they make", async () => {
    const { characterId, itemId } = await setup();
    const worn = await expectOk(
      inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, location: "Trinket" } }),
    );
    const charged = await expectOk(
      inventory.$post({
        param: { characterId },
        json: { ...unequipped, itemId, quantity: 2, totalCharges: 5, remainingCharges: 3 },
      }),
    );

    const { blocks } = await expectOk(api.api.characters[":id"].$get({ param: { id: characterId } }));
    const block = blocks.find((each) => each.key === "equipment");
    if (block?.kind !== "inventory") throw new Error("no inventory");
    expect(block).toMatchObject({
      title: "Equipment & Inventory",
      entityType: "items",
      itemFields: { cost: ITEM_COST_GP, weight: ITEM_WEIGHT },
      units: { cost: { one: "gp", many: "gp" }, weight: { one: "lb", many: "lbs" } },
      words: { add: "Add Item", remove: { title: "Remove Item" } },
    });
    expect(block.rows.find((row) => row.key === worn.id)).toEqual({
      key: worn.id,
      id: itemId,
      name: "Inventory Item",
      description: null,
      slot: "Trinket",
      quantity: 1,
      weight: 5,
      cost: 10,
      held: true,
    });
    expect(block.rows.find((row) => row.key === charged.id)).toMatchObject({
      quantity: 2,
      held: false,
      slot: null,
      charges: { remaining: 3, total: 5 },
    });
    expect(block.load?.figures.map(({ label, short }) => [label, short])).toEqual([
      ["Carried Weight", "Carried"],
      ["Light", "Light"],
      ["Medium", "Medium"],
      ["Heavy", "Heavy"],
    ]);
    // Three of a 5 lb. item
    expect(Number(block.load?.figures[0].weight)).toBe(15);
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
      inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, location: "Head" } }),
    );
    expect(
      await expectOk(placement.$get({ param: { characterId }, query: { location: "Head", groups: "0" } })),
    ).toEqual({ warning: "Head slot is occupied by Inventory Item" });
    expect(
      await expectOk(
        placement.$get({ param: { characterId }, query: { location: "Head", groups: "0", entryId: held.id } }),
      ),
    ).toEqual({ warning: null });
  });

  test("holds an entry in a list of weapon sets, and answers a placement in a comma-separated list of them", async () => {
    const { characterId, itemId } = await setup();
    const held = await expectOk(
      inventory.$post({
        param: { characterId },
        json: { ...unequipped, itemId, location: "Off Hand", groups: [1, 0] },
      }),
    );
    expect(held.groups).toEqual([0, 1]);
    const [listed] = await expectOk(inventory.$get({ param: { characterId } }));
    expect(listed.slotLabel).toBe("Off Hand (Sets 1, 2)");
    expect(
      await expectOk(
        inventory.placement.$get({ param: { characterId }, query: { location: "Off Hand", groups: "2,1" } }),
      ),
    ).toEqual({ warning: "Off Hand is occupied by Inventory Item (Set 2)" });
    await expectStatus(inventory.$post({ param: { characterId }, json: { ...unequipped, itemId, groups: [-1] } }), 400);
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
    await expectStatus(guest.placement.$get({ param: { characterId }, query: { location: "Head", groups: "0" } }), 401);
    await expectStatus(guest.$post({ param: { characterId }, json: { ...unequipped, itemId } }), 401);
    await expectStatus(guest[":entryId"].$put({ param: { characterId, entryId: itemId }, json: unequipped }), 401);
    await expectStatus(guest[":entryId"].$delete({ param: { characterId, entryId: itemId } }), 401);
  });
});
