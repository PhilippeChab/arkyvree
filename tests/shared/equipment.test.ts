import { describe, expect, test } from "bun:test";

import { findSlotConflict, HAND_LOCATIONS, isHandLocation, MAX_FINGER_ITEMS } from "@/shared/equipment.ts";

/** An equipped entry at `location`, in `weaponSet` (stored from 0) for a hand. */
function at(location: string, weaponSet: number | null = null) {
  return { location, weaponSet };
}

describe("A location", () => {
  test("is a hand when a weapon set applies to it", () => {
    expect(HAND_LOCATIONS.every(isHandLocation)).toBe(true);
    for (const other of ["Torso", "Finger", "Other", null, undefined, "main hand"])
      expect(isHandLocation(other)).toBe(false);
  });
});

describe("A slot conflict", () => {
  test("is none at an empty location, nor in another weapon set", () => {
    expect(findSlotConflict("Head", null, [at("Neck")])).toBeNull();
    expect(findSlotConflict("Two Handed", 0, [at("Main Hand", 1), at("Off Hand", 1)])).toBeNull();
    expect(findSlotConflict("Main Hand", 0, [at("Two Handed", 1)])).toBeNull();
    // Locations past single occupancy take several items
    expect(findSlotConflict("Other", null, [at("Other"), at("Other")])).toBeNull();
  });

  test("is the item already in a location that holds one", () => {
    const helmet = at("Head");
    expect(findSlotConflict("Head", null, [at("Neck"), helmet])).toEqual({ reason: "occupied", entry: helmet });
  });

  test("is every finger taken", () => {
    const rings = Array.from({ length: MAX_FINGER_ITEMS }, () => at("Finger"));
    expect(findSlotConflict("Finger", null, rings.slice(1))).toBeNull();
    expect(findSlotConflict("Finger", null, rings)).toEqual({ reason: "fingers" });
  });

  test("is a hand in use for a two-handed item, a two-handed item for a hand, or the hand itself, in the same set", () => {
    const sword = at("Main Hand", 0);
    const greatsword = at("Two Handed", 0);
    expect(findSlotConflict("Two Handed", 0, [sword])).toEqual({ reason: "hands", entry: sword });
    expect(findSlotConflict("Off Hand", 0, [greatsword])).toEqual({ reason: "twoHanded", entry: greatsword });
    expect(findSlotConflict("Main Hand", 0, [sword])).toEqual({ reason: "sameHand", entry: sword });
    expect(findSlotConflict("Two Handed", 0, [greatsword])).toEqual({ reason: "sameHand", entry: greatsword });
  });
});
