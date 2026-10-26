import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import { type ItemLocation, LOCATION_OPTIONS } from "@/shared/enums.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import { HAND_LOCATIONS } from "@/vocabulary/dnd3.5/equipment.ts";
import { ITEM_HAS_CHARGES, ITEM_SLOT, ITEM_TYPE, WEAPON_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** An item's stored values, its `ITEM_HAS_CHARGES` field holding `value`. */
function charges(value: FieldValue) {
  return storedValues([[ITEM_HAS_CHARGES, value]]);
}

/** An item as its placement reads it: its type (none for none) and its slot, its own fields. */
function placed(type: string | null, slot: ItemLocation) {
  return { fields: { [ITEM_SLOT]: slot, ...(type !== null && { [ITEM_TYPE]: type }) } };
}

describe("A location", () => {
  test("is a hand when a weapon set applies to it", () => {
    expect(HAND_LOCATIONS.every((location) => ItemPlacement.isHand(location))).toBe(true);
    for (const other of ["Torso", "Finger", "Other", null, undefined, "main hand"])
      expect(ItemPlacement.isHand(other)).toBe(false);
  });
});

describe("An item type", () => {
  test("sets its items' locations when it's a weapon, body armor or a shield", () => {
    for (const type of ["Weapon", "Armor", "Shield"]) expect(ItemPlacement.isLocatedType(type)).toBe(true);
  });

  test("sets none for another type, none, or a name the table's object answers", () => {
    for (const type of ["Wondrous Item", null, "weapon", "constructor", "toString"])
      expect(ItemPlacement.isLocatedType(type)).toBe(false);
  });
});

describe("An item's placement", () => {
  test("goes to the one location its type sets, the hand its wielder picks for a weapon, else its own slot", () => {
    expect(ItemPlacement.describe(placed("Armor", "Other"), OwnerValues.NONE).slot).toBe("Torso");
    expect(ItemPlacement.describe(placed("Shield", "Other"), OwnerValues.NONE).slot).toBe("Off Hand");
    expect(ItemPlacement.describe(placed("Weapon", "Main Hand"), OwnerValues.NONE)).toMatchObject({
      slot: null,
      hand: true,
    });
    expect(ItemPlacement.describe(placed(null, "Neck"), OwnerValues.NONE)).toMatchObject({
      slot: "Neck",
      hand: false,
    });
  });

  test("offers the locations its type sets, else its own slot's or every one", () => {
    const offered = (type: string | null, slot: "Head" | "Other") =>
      ItemPlacement.describe(placed(type, slot), OwnerValues.NONE).locations.map((option) => option.location);
    expect(offered("Weapon", "Other")).toEqual([...HAND_LOCATIONS]);
    expect(offered("Shield", "Other")).toEqual(["Off Hand"]);
    expect(offered(null, "Other")).toEqual(["Other"]);
    expect(offered(null, "Head")).toEqual([...LOCATION_OPTIONS]);
  });

  test("offers a weapon too large for one hand both hands alone: Large or past it", () => {
    const offered = (size: string) =>
      ItemPlacement.describe(placed("Weapon", "Other"), storedValues([[WEAPON_SIZE, size]])).locations.map(
        (option) => option.location,
      );
    expect(offered("Large")).toEqual(["Two Handed"]);
    expect(offered("Huge")).toEqual(["Two Handed"]);
    expect(offered("Medium")).toEqual([...HAND_LOCATIONS]);
    expect(offered("Small")).toEqual([...HAND_LOCATIONS]);
  });

  test("asks for a weapon set in a weapon's or a shield's hand only", () => {
    const asked = (type: string | null) =>
      ItemPlacement.describe(placed(type, "Head"), OwnerValues.NONE)
        .locations.filter((option) => option.grouped)
        .map((option) => option.location);
    expect(asked("Weapon")).toEqual([...HAND_LOCATIONS]);
    expect(asked("Shield")).toEqual(["Off Hand"]);
    // A torch held in a hand keeps the set the form starts on
    expect(asked(null)).toEqual([]);
  });

  test("comes with the charges its field counts: none without one, 0 for one that counts none", () => {
    const item = placed(null, "Other");
    expect(ItemPlacement.describe(item, OwnerValues.NONE).charges).toBeNull();
    expect(ItemPlacement.describe(item, charges(50)).charges).toBe(50);
    expect(ItemPlacement.describe(item, charges("many")).charges).toBe(0);
  });
});

describe("Where an entry is worn", () => {
  test("names each weapon set a hand holds it in, from 1", () => {
    expect(ItemPlacement.describeSlot({ equipped: true, location: "Off Hand", groups: [0, 1] })).toBe(
      "Off Hand (Sets 1, 2)",
    );
    expect(ItemPlacement.describeSlot({ equipped: true, location: "Main Hand", groups: [0, 2, 3] })).toBe(
      "Main Hand (Sets 1, 3, 4)",
    );
  });

  test("is its location, its weapon set from 1 in a hand, or none while it's carried", () => {
    expect(ItemPlacement.describeSlot({ equipped: true, location: "Main Hand", groups: [0] })).toBe(
      "Main Hand (Set 1)",
    );
    expect(ItemPlacement.describeSlot({ equipped: true, location: "Two Handed", groups: [2] })).toBe(
      "Two Handed (Set 3)",
    );
    expect(ItemPlacement.describeSlot({ equipped: true, location: "Neck", groups: [] })).toBe("Neck");
    expect(ItemPlacement.describeSlot({ equipped: false, location: null, groups: [] })).toBeNull();
  });
});
