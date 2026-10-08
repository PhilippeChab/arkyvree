import { describe, expect, test } from "bun:test";

import {
  detectSlotFromItem,
  getSlotConflictWarning,
  placementPayload,
  placementProfile,
} from "@/client/src/components/characters/sections/equipment.ts";
import { type ItemLocation, LOCATION_OPTIONS } from "@/shared/enums.ts";
import { HAND_LOCATIONS } from "@/shared/equipment.ts";

/** An equipped item named `name` at `location`, in `weaponSet` (stored from 0) for a hand: its entry's id `id`. */
function placed(name: string, location: ItemLocation, weaponSet: number | null = null, id = name) {
  return {
    id,
    equipped: true,
    location,
    weaponSet,
    item: { name },
  };
}

describe("The inventory dialog's slot warning", () => {
  const inventory = [
    placed("Helm", "Head"),
    placed("Ring of Protection", "Finger"),
    placed("Ring of Wizardry", "Finger"),
    placed("Longsword", "Main Hand", 0),
    placed("Greatsword", "Two Handed", 1),
  ];

  test("names what takes the slot, with the weapon set as the form shows it", () => {
    expect(getSlotConflictWarning("Head", 1, inventory)).toBe("Head slot is occupied by Helm");
    expect(getSlotConflictWarning("Finger", 1, inventory)).toBe("Both finger slots are occupied");
    expect(getSlotConflictWarning("Two Handed", 1, inventory)).toBe(
      "Cannot equip two-handed: Longsword is in Main Hand (Set 1)",
    );
    expect(getSlotConflictWarning("Off Hand", 2, inventory)).toBe("Cannot equip: Greatsword is two-handed in Set 2");
    expect(getSlotConflictWarning("Main Hand", 1, inventory)).toBe("Main Hand is occupied by Longsword (Set 1)");
  });

  test("counts the item's own other entry: a second dagger in the hand the first holds", () => {
    const daggers = [placed("Dagger", "Main Hand", 0, "first dagger")];
    expect(getSlotConflictWarning("Main Hand", 1, daggers, "second dagger")).toBe(
      "Main Hand is occupied by Dagger (Set 1)",
    );
    expect(getSlotConflictWarning("Off Hand", 1, daggers, "second dagger")).toBeNull();
  });

  test("is none for a free slot, nothing equipped, or the entry being edited", () => {
    expect(getSlotConflictWarning("Neck", 1, inventory)).toBeNull();
    expect(getSlotConflictWarning("Off Hand", 1, inventory)).toBeNull();
    expect(getSlotConflictWarning("none", 1, inventory)).toBeNull();
    expect(getSlotConflictWarning("Head", 1, inventory, "Helm")).toBeNull();
    expect(getSlotConflictWarning("Head", 1, [{ ...placed("Helm", "Head"), equipped: false }])).toBeNull();
  });
});

describe("An inventory placement", () => {
  const form = { selectedItem: null, quantity: 2, weaponSet: 2, totalCharges: 5, remainingCharges: 3 };

  test("equips at a slot, with the weapon set stored from 0 for a hand only", () => {
    expect(placementPayload({ ...form, location: "Main Hand" }, false)).toEqual({
      quantity: 2,
      equipped: true,
      location: "Main Hand",
      totalCharges: null,
      remainingCharges: null,
      weaponSet: 1,
    });
    expect(placementPayload({ ...form, location: "Neck" }, true)).toMatchObject({ weaponSet: null, totalCharges: 5 });
    expect(placementPayload({ ...form, location: "none" }, false)).toMatchObject({ equipped: false, location: null });
  });
});

describe("A picked item's slot", () => {
  test("is the one its type sets, the user's pick among a weapon's hands, else its own slot", () => {
    expect(detectSlotFromItem({ type: "Armor", slot: "Other" })).toBe("Torso");
    expect(detectSlotFromItem({ type: "Shield", slot: "Other" })).toBe("Off Hand");
    expect(detectSlotFromItem({ type: "Weapon", slot: "Main Hand" })).toBeNull();
    expect(detectSlotFromItem({ type: null, slot: "neck" })).toBe("Neck");
    expect(detectSlotFromItem({ type: null, slot: "Saddle" })).toBeNull();
  });

  test("is offered among the locations its type sets, else its own slot's or every one", () => {
    expect(placementProfile({ type: "Weapon", slot: "Other" }, []).locationOptions).toEqual(HAND_LOCATIONS);
    expect(placementProfile({ type: "Shield", slot: "Other" }, []).locationOptions).toEqual(["Off Hand"]);
    expect(placementProfile({ type: null, slot: "Other" }, []).locationOptions).toEqual(["Other"]);
    expect(placementProfile({ type: null, slot: "Head" }, []).locationOptions).toEqual(LOCATION_OPTIONS);
  });
});
