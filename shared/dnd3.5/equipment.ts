/** Where equipped items go: the locations that hold one item, the hands, and the item types that set their locations. */

import type { ItemLocation } from "@/shared/enums.ts";

export type HandLocation = (typeof HAND_LOCATIONS)[number];

/** The locations a weapon set applies to: the hands. */
export const HAND_LOCATIONS = ["Main Hand", "Off Hand", "Two Handed"] as const satisfies readonly ItemLocation[];

/** The item types that go to set locations, with them: a weapon to a hand, body armor to the torso, a shield to the off hand. */
export const ITEM_TYPE_LOCATIONS = {
  Armor: ["Torso"],
  Shield: ["Off Hand"],
  Weapon: HAND_LOCATIONS,
} as const satisfies Record<string, readonly ItemLocation[]>;

/** How many rings a character can wear. */
export const MAX_FINGER_ITEMS = 2;

/** The locations that hold one item. */
export const SINGLE_OCCUPANCY_LOCATIONS = [
  "Head",
  "Neck",
  "Shoulders",
  "Torso",
  "Wrists",
  "Hands",
  "Waist",
  "Trinket",
] as const satisfies readonly ItemLocation[];
