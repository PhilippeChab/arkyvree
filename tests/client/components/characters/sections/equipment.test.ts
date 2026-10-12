import { describe, expect, test } from "bun:test";

import {
  pickedLocation,
  placementPayload,
  type PlacementProfile,
  weaponSetChoices,
} from "@/client/src/components/characters/sections/equipment.ts";

/** An item's placement, as its ruleset says: one that comes with `charges` (none for an item without charges). */
function profile(charges: number | null): PlacementProfile {
  return { charges, hand: false, locations: [{ location: "Neck", weaponSet: false }], slot: "Neck" };
}

describe("An inventory placement", () => {
  const form = { selectedItem: null, quantity: 2, weaponSets: [2], totalCharges: 5, remainingCharges: 3 };

  test("sends each of its weapon sets stored from 0", () => {
    expect(placementPayload({ ...form, location: "Off Hand", weaponSets: [1, 2] }, null)).toMatchObject({
      weaponSets: [0, 1],
    });
  });

  test("equips at a slot, with the weapon set stored from 0, which the server keeps for a hand only", () => {
    expect(placementPayload({ ...form, location: "Main Hand" }, profile(null))).toEqual({
      quantity: 2,
      equipped: true,
      location: "Main Hand",
      totalCharges: null,
      remainingCharges: null,
      weaponSets: [1],
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

describe("The weapon sets a held item is offered", () => {
  test("are the sets the inventory and the form hold, as shown from 1, then a new one past them", () => {
    const entries = [{ weaponSets: [0] }, { weaponSets: [] }, { weaponSets: [0, 2] }];
    expect(weaponSetChoices(entries, [1])).toEqual([1, 3, 4]);
    expect(weaponSetChoices(entries, [5])).toEqual([1, 3, 5, 6]);
    expect(weaponSetChoices([], [])).toEqual([1]);
  });
});

describe("A picked item's location", () => {
  const hands: PlacementProfile = {
    charges: null,
    hand: true,
    locations: [
      { location: "Main Hand", weaponSet: true },
      { location: "Off Hand", weaponSet: true },
    ],
    slot: null,
  };

  test("is the slot its placement sets", () => {
    expect(pickedLocation("Main Hand", profile(null))).toBe("Neck");
  });

  test("drops an earlier pick's slot the item can't take", () => {
    expect(pickedLocation("Torso", hands)).toBe("none");
  });

  test("keeps a location the item can take", () => {
    expect(pickedLocation("Off Hand", hands)).toBe("Off Hand");
    expect(pickedLocation("none", hands)).toBe("none");
  });
});
