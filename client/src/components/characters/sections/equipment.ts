import type { InferResponseType } from "hono/client";

import type { CharacterDetail, RulesetItem } from "@/client/src/lib/queries.ts";
import type { RPC } from "@/client/src/services/rpc.ts";
import { ITEM_HAS_CHARGES } from "@/shared/dnd3.5/properties/index.ts";
import { type ItemLocation, LOCATION_OPTIONS } from "@/shared/enums.ts";
import { findSlotConflict, HAND_LOCATIONS, isHandLocation, type SlotConflictReason } from "@/shared/equipment.ts";

/** A sheet's equipment row: the inventory entry with its item's fields. */
export type EquipmentRow = CharacterDetail["equipment"][number];

/** The sheet's carried weight and load thresholds (the combat section's `encumbrance`). */
export type EncumbranceData = Omit<CharacterDetail["combat"]["encumbrance"], "maxdex"> & {
  /** No cap (the server's Infinity, sent as null) under a light load. */
  maxdex: number | null;
};

type InventoryEntry = InferResponseType<RPC["api"]["characters"]["inventory"][":characterId"]["$get"], 200>[number];

/** The add and edit inventory dialogs' form: the item (add only) and where and how it's carried. */
export interface InventoryFormData {
  selectedItem: RulesetItem | null;
  quantity: number;
  location: ItemLocation | "none";
  /** As shown, from 1 (see `shownWeaponSet`). */
  weaponSet: number;
  totalCharges: number;
  remainingCharges: number;
}

/** The item fields placement depends on. */
export type ItemColumns = { type: string | null; slot: string };

type ItemProperties = { type: string; value: string }[];

export type PlacementProfile = ReturnType<typeof placementProfile>;

/** An inventory entry as the slot warnings read it. */
type PlacedEntry = Pick<InventoryEntry, "id" | "equipped" | "location" | "weaponSet"> & {
  item: Pick<InventoryEntry["item"], "name">;
};

/** A slot, or not equipped. */
export const LOCATION_CHOICES = [...LOCATION_OPTIONS, "none"] as const;

/** The warning for a slot taken by `entry`, `weaponSet` as the form shows it. */
const SLOT_CONFLICT_WARNINGS: Record<
  Exclude<SlotConflictReason, "fingers">,
  (location: ItemLocation, entry: PlacedEntry, weaponSet: number) => string
> = {
  occupied: (location, entry) => `${location} slot is occupied by ${entry.item.name}`,
  hands: (_, entry, weaponSet) =>
    `Cannot equip two-handed: ${entry.item.name} is in ${entry.location} (Set ${weaponSet})`,
  twoHanded: (_, entry, weaponSet) => `Cannot equip: ${entry.item.name} is two-handed in Set ${weaponSet}`,
  sameHand: (location, entry, weaponSet) => `${location} is occupied by ${entry.item.name} (Set ${weaponSet})`,
};

/** A weapon set as the user sees it: stored from 0, shown from 1 ("Set 1"), as on the sheet and the PDF. */
export function shownWeaponSet(stored: number) {
  return stored + 1;
}

/** Where an entry is worn ("Main Hand (Set 1)"), or a dash when it's carried. */
export function formatSlotDisplay(entry: Pick<EquipmentRow, "equipped" | "location" | "weaponSet">): string {
  if (!entry.equipped || !entry.location) return "—";
  if (isHandLocation(entry.location) && entry.weaponSet !== null) {
    return `${entry.location} (Set ${shownWeaponSet(entry.weaponSet)})`;
  }
  return entry.location;
}

export const EMPTY_INVENTORY_FORM: InventoryFormData = {
  selectedItem: null,
  quantity: 1,
  location: "none",
  weaponSet: shownWeaponSet(0),
  totalCharges: 0,
  remainingCharges: 0,
};

/**
 * Why the slot is taken (by another entry, the same item's in another place included, or a two-handed weapon in the
 * same set), if it is: the entry being edited (`excludeEntryId`) aside.
 */
export function getSlotConflictWarning(
  location: ItemLocation | "none",
  /** As the form shows it, from 1. */
  weaponSet: number,
  inventoryItems: PlacedEntry[],
  excludeEntryId?: string,
): string | null {
  if (!location || location === "none") return null;

  const equipped = inventoryItems.filter((e) => e.equipped && e.location && e.id !== excludeEntryId);
  const conflict = findSlotConflict(location, weaponSet - 1, equipped);
  if (!conflict) return null;
  if (conflict.reason === "fingers") return "Both finger slots are occupied";
  return SLOT_CONFLICT_WARNINGS[conflict.reason](location, conflict.entry, weaponSet);
}

/** The slot an item goes to when picked, or null to leave the choice (a weapon's hand) to the user. */
export function detectSlotFromItem(item: ItemColumns): ItemLocation | null {
  if (item.type === "Weapon") return null; // hand slot picker
  if (item.type === "Armor") return "Torso";
  if (item.type === "Shield") return "Off Hand";
  return LOCATION_OPTIONS.find((v) => v.toLowerCase() === item.slot.toLowerCase()) ?? null;
}

/** The placement as the inventory endpoints take it: a slot equips the item, charges only for items that have them. */
export function placementPayload(data: InventoryFormData, hasCharges: boolean) {
  const location = data.location && data.location !== "none" ? data.location : null;
  return {
    quantity: data.quantity,
    equipped: !!location,
    location,
    totalCharges: hasCharges ? data.totalCharges : null,
    remainingCharges: hasCharges ? data.remainingCharges : null,
    weaponSet: isHandLocation(location) ? data.weaponSet - 1 : null,
  };
}

/** How an item is placed: the slots it can take, whether a weapon set applies, and its charges. */
export function placementProfile(item: ItemColumns, properties: ItemProperties) {
  const isWeapon = item.type === "Weapon";
  const isShield = item.type === "Shield";
  const chargesProperty = properties.find((p) => p.type === ITEM_HAS_CHARGES);
  const locationOptions: readonly ItemLocation[] = isWeapon
    ? HAND_LOCATIONS
    : isShield
      ? ["Off Hand"]
      : item.type === "Armor"
        ? ["Torso"]
        : item.slot === "Other"
          ? ["Other"]
          : LOCATION_OPTIONS;
  return {
    /** A weapon picks a hand rather than a slot. */
    isWeapon,
    showWeaponSet: isWeapon || isShield,
    locationOptions,
    charges: { has: !!chargesProperty, defaultCount: Number.parseInt(chargesProperty?.value ?? "", 10) || 0 },
  };
}
