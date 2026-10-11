import { describe, expect, test } from "bun:test";

import { placementPayload, type PlacementProfile } from "@/client/src/components/characters/sections/equipment.ts";

/** An item's placement, as its ruleset says: one that comes with `charges` (none for an item without charges). */
function profile(charges: number | null): PlacementProfile {
  return { charges, hand: false, locations: [{ location: "Neck", weaponSet: false }], slot: "Neck" };
}

describe("An inventory placement", () => {
  const form = { selectedItem: null, quantity: 2, weaponSet: 2, totalCharges: 5, remainingCharges: 3 };

  test("equips at a slot, with the weapon set stored from 0, which the server keeps for a hand only", () => {
    expect(placementPayload({ ...form, location: "Main Hand" }, profile(null))).toEqual({
      quantity: 2,
      equipped: true,
      location: "Main Hand",
      totalCharges: null,
      remainingCharges: null,
      weaponSet: 1,
    });
    expect(placementPayload({ ...form, location: "none" }, null)).toMatchObject({ equipped: false, location: null });
  });

  test("sends charges for an item that comes with them only", () => {
    expect(placementPayload({ ...form, location: "Neck" }, profile(10))).toMatchObject({
      totalCharges: 5,
      remainingCharges: 3,
    });
    expect(placementPayload({ ...form, location: "Neck" }, profile(null))).toMatchObject({
      totalCharges: null,
      remainingCharges: null,
    });
  });
});
