import { describe, expect, test } from "bun:test";

import {
  groupChoices,
  pickedLocation,
  placementPayload,
  type PlacementProfile,
} from "@/client/src/components/characters/sections/equipment.ts";

/** An item's placement, as its ruleset says: one that comes with `charges` (none for an item without charges). */
function profile(charges: number | null): PlacementProfile {
  return { charges, hand: false, locations: [{ location: "Neck", grouped: false }], slot: "Neck" };
}

describe("An inventory placement", () => {
  const form = { selectedItem: null, quantity: 2, groups: [2], totalCharges: 5, remainingCharges: 3 };

  test("sends each of its groups stored from 0", () => {
    expect(placementPayload({ ...form, location: "Off Hand", groups: [1, 2] }, null)).toMatchObject({
      groups: [0, 1],
    });
  });

  test("equips at a slot, with the group stored from 0 and the form's charges", () => {
    expect(placementPayload({ ...form, location: "Main Hand" }, profile(null))).toEqual({
      quantity: 2,
      location: "Main Hand",
      totalCharges: 5,
      remainingCharges: 3,
      groups: [1],
    });
    expect(placementPayload({ ...form, location: "none" }, null)).toMatchObject({ location: null });
  });

  test("sends no charges while the item's details load, which would be an earlier pick's", () => {
    expect(placementPayload({ ...form, location: "Neck" }, null)).toMatchObject({
      totalCharges: null,
      remainingCharges: null,
    });
  });
});

describe("The groups a held item is offered", () => {
  test("are the groups the inventory and the form hold, as shown from 1, then a new one past them", () => {
    const entries = [{ groups: [0] }, { groups: [] }, { groups: [0, 2] }];
    expect(groupChoices(entries, [1])).toEqual([1, 3, 4]);
    expect(groupChoices(entries, [5])).toEqual([1, 3, 5, 6]);
    expect(groupChoices([], [])).toEqual([1]);
  });
});

describe("A picked item's location", () => {
  const hands: PlacementProfile = {
    charges: null,
    hand: true,
    locations: [
      { location: "Main Hand", grouped: true },
      { location: "Off Hand", grouped: true },
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
