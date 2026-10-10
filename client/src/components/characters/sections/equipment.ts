import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { type ItemLocation, LOCATION_OPTIONS } from "@/shared/enums.ts";

import type { RulesetItem, RulesetItemDetail } from "./equipmentQueries.ts";
import { shownWeaponSet } from "./weaponSets.ts";

/** The sheet's carried weight and load thresholds (the combat section's `encumbrance`). */
export type EncumbranceData = CharacterDetail["combat"]["encumbrance"];

/** A sheet's equipment row: the inventory entry with its item's fields. */
export type EquipmentRow = CharacterDetail["equipment"][number];

/** The add and edit inventory dialogs' form: the item (add only) and where and how it's carried. */
export interface InventoryFormData {
  location: ItemLocation | "none";
  quantity: number;
  remainingCharges: number;
  selectedItem: RulesetItem | null;
  totalCharges: number;
  /** As shown, from 1 (see `shownWeaponSet`). */
  weaponSet: number;
}

/**
 * How an item is placed, as its ruleset says: the location it goes to once picked, the locations it can take (each
 * saying whether the form asks for a weapon set there), whether its wielder picks its hand, and its charges.
 */
export type PlacementProfile = RulesetItemDetail["placement"];

export const EMPTY_INVENTORY_FORM: InventoryFormData = {
  selectedItem: null,
  quantity: 1,
  location: "none",
  weaponSet: shownWeaponSet(0),
  totalCharges: 0,
  remainingCharges: 0,
};

/** A slot, or not equipped. */
export const LOCATION_CHOICES = [...LOCATION_OPTIONS, "none"] as const;

/**
 * The placement as the inventory endpoints take it: a slot equips the item, charges only for an item that has them (as
 * its `profile` says), and the weapon set stored from 0, which the server keeps for a hand only.
 */
export function placementPayload(data: InventoryFormData, profile: PlacementProfile | null) {
  const location = data.location && data.location !== "none" ? data.location : null;
  const hasCharges = typeof profile?.charges === "number";
  return {
    quantity: data.quantity,
    equipped: !!location,
    location,
    totalCharges: hasCharges ? data.totalCharges : null,
    remainingCharges: hasCharges ? data.remainingCharges : null,
    weaponSet: data.weaponSet - 1,
  };
}
