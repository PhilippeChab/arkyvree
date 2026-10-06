/** Where equipped items go: the rules the server enforces and the inventory dialogs warn about. */

import type { ItemLocation } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

/** An equipped inventory entry, as the slot rules read it. */
interface EquippedEntry {
  location: string | null;
  /** Stored from 0; null outside the hands. */
  weaponSet: number | null;
}

/**
 * Why `location` can't take one more item, given the `equipped` entries (the item itself left out), with the entry in
 * the way:
 * - `occupied`: a location that holds one item holds `entry`;
 * - `fingers`: both fingers are taken;
 * - `hands`: a two-handed item can't go where `entry` is in a hand of the same weapon set;
 * - `twoHanded`: a hand can't take an item while `entry` is two-handed in the same set;
 * - `sameHand`: `entry` is already in that hand in the same set.
 */
type SlotConflict<T extends EquippedEntry> =
  | { reason: Exclude<SlotConflictReason, "fingers">; entry: T }
  | { reason: "fingers" };

export type HandLocation = (typeof HAND_LOCATIONS)[number];

export type SlotConflictReason = "occupied" | "fingers" | "hands" | "twoHanded" | "sameHand";

/** The locations that hold one item. */
const SINGLE_OCCUPANCY_LOCATIONS = [
  "Head",
  "Neck",
  "Shoulders",
  "Torso",
  "Wrists",
  "Hands",
  "Waist",
  "Trinket",
] as const satisfies readonly ItemLocation[];

/** The locations a weapon set applies to: the hands. */
export const HAND_LOCATIONS = ["Main Hand", "Off Hand", "Two Handed"] as const satisfies readonly ItemLocation[];

/** How many rings a character can wear. */
export const MAX_FINGER_ITEMS = 2;

/** Whether `location` is a hand, which a weapon set applies to. */
export function isHandLocation(location: unknown): location is HandLocation {
  return isOneOf(location, HAND_LOCATIONS);
}

/** What keeps `location` (in `weaponSet`, stored from 0, for a hand) from taking an item, if anything does. */
export function findSlotConflict<T extends EquippedEntry>(
  location: ItemLocation,
  weaponSet: number | null,
  equipped: readonly T[],
): SlotConflict<T> | null {
  if (isOneOf(location, SINGLE_OCCUPANCY_LOCATIONS)) {
    const entry = equipped.find((e) => e.location === location);
    if (entry) return { reason: "occupied", entry };
  }

  if (location === "Finger" && equipped.filter((e) => e.location === "Finger").length >= MAX_FINGER_ITEMS) {
    return { reason: "fingers" };
  }

  if (isHandLocation(location)) {
    const sameSet = equipped.filter((e) => isHandLocation(e.location) && e.weaponSet === weaponSet);
    const find = (...locations: string[]) => sameSet.find((e) => e.location !== null && locations.includes(e.location));

    const handed = location === "Two Handed" ? find("Main Hand", "Off Hand") : undefined;
    if (handed) return { reason: "hands", entry: handed };
    const twoHanded = location === "Two Handed" ? undefined : find("Two Handed");
    if (twoHanded) return { reason: "twoHanded", entry: twoHanded };
    const same = find(location);
    if (same) return { reason: "sameHand", entry: same };
  }

  return null;
}
