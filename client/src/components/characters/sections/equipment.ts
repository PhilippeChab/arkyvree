import { type ItemLocation, LOCATION_OPTIONS } from "@/shared/enums.ts";

import type { InventoryEntry, RulesetItem, RulesetItemDetail } from "./equipmentQueries.ts";
import { shownGroup, storedGroups } from "./groups.ts";

/** The add and edit inventory dialogs' form: the item (add only) and where and how it's carried. */
export interface InventoryFormData {
  /** The groups it's held in (3.5's weapon sets a hand holds it in), as shown, from 1 (see `shownGroup`). */
  groups: number[];
  location: ItemLocation | "none";
  quantity: number;
  remainingCharges: number;
  selectedItem: RulesetItem | null;
  totalCharges: number;
}

/**
 * How an item is placed, as its ruleset says: the location it goes to once picked, the locations it can take (each
 * saying whether the form asks for its groups there), whether its wielder picks its hand, and its charges.
 */
export type PlacementProfile = RulesetItemDetail["placement"];

export const EMPTY_INVENTORY_FORM: InventoryFormData = {
  selectedItem: null,
  quantity: 1,
  location: "none",
  groups: [shownGroup(0)],
  totalCharges: 0,
  remainingCharges: 0,
};

/** A slot, or not equipped. */
export const LOCATION_CHOICES = [...LOCATION_OPTIONS, "none"] as const;

/**
 * The groups (3.5's weapon sets) the form offers a held item, as shown, from 1: those the character's inventory holds
 * something in and those the form holds, in order, then a new one past them all.
 */
export function groupChoices(entries: Pick<InventoryEntry, "groups">[], picked: number[]) {
  const sets = new Set([...entries.flatMap((entry) => entry.groups.map(shownGroup)), ...picked]);
  const ordered = [...sets].sort((a, b) => a - b);
  return [...ordered, (ordered.at(-1) ?? 0) + 1];
}

/**
 * Where a picked item goes: the slot its placement sets, else the location the form holds when the item can take it (an
 * earlier pick's, which a weapon's hands or another item's slot may not offer), else not equipped.
 */
export function pickedLocation(current: InventoryFormData["location"], placement: PlacementProfile) {
  if (placement.slot) return placement.slot;
  return placement.locations.some((option) => option.location === current) ? current : "none";
}

/**
 * The placement as the inventory endpoints take it: a slot equips the item, charges only for an item that has them (as
 * its `profile` says), and the groups stored from 0, which the server keeps where its placement takes them.
 */
export function placementPayload(data: InventoryFormData, profile: PlacementProfile | null) {
  const location = data.location === "none" ? null : data.location;
  const hasCharges = typeof profile?.charges === "number";
  return {
    quantity: data.quantity,
    equipped: !!location,
    location,
    totalCharges: hasCharges ? data.totalCharges : null,
    remainingCharges: hasCharges ? data.remainingCharges : null,
    groups: storedGroups(data.groups),
  };
}
