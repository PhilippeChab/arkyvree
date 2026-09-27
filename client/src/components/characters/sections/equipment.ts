import type { CharacterDetail, RulesetItem } from "@/client/src/lib/queries.ts";
import type { RPC } from "@/client/src/services/rpc.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";
import type { InferResponseType } from "hono/client";

export type LocationValue = (typeof LOCATION_OPTIONS)[number];

/** A sheet's equipment row: the inventory entry with its item's fields. */
export type EquipmentRow = CharacterDetail["equipment"][number];

/** The sheet's carried weight and load thresholds (the combat section's `encumbrance`). */
export type EncumbranceData = Omit<CharacterDetail["combat"]["encumbrance"], "maxdex"> & {
  /** No cap (the server's Infinity, sent as null) under a light load. */
  maxdex: number | null;
};

// Typed as strings so API locations can be checked without a cast.
/** The slots a weapon set applies to. */
export const HAND_SLOTS: ReadonlySet<string> = new Set<LocationValue>(["Main Hand", "Off Hand", "Two Handed"]);

/** A weapon set as the user sees it: stored from 0, shown from 1 ("Set 1"), as on the sheet and the PDF. */
export const shownWeaponSet = (stored: number) => stored + 1;

/** Where an entry is worn ("Main Hand (Set 1)"), or a dash when it's carried. */
export function formatSlotDisplay(entry: Pick<EquipmentRow, "equipped" | "location" | "weaponSet">): string {
  if (!entry.equipped || !entry.location) return "—";
  if (HAND_SLOTS.has(entry.location) && entry.weaponSet !== null) {
    return `${entry.location} (Set ${shownWeaponSet(entry.weaponSet)})`;
  }
  return entry.location;
}

// ── Inventory dialogs ────────────────────────────────────────────────

type InventoryEntry = InferResponseType<RPC["api"]["characters"]["inventory"][":characterId"]["$get"], 200>[number];

/** A slot, or not equipped. */
export const LOCATION_CHOICES = [...LOCATION_OPTIONS, "none"] as const;

const SINGLE_OCCUPANCY_SLOTS = new Set<LocationValue>([
  "Head", "Neck", "Shoulders", "Torso", "Wrists",
  "Hands", "Waist", "Trinket",
]);

/** The add and edit inventory dialogs' form: the item (add only) and where and how it's carried. */
export interface InventoryFormData {
  selectedItem: RulesetItem | null;
  quantity: number;
  location: LocationValue | "none";
  /** As shown, from 1 (see `shownWeaponSet`). */
  weaponSet: number;
  totalCharges: number;
  remainingCharges: number;
}

export const EMPTY_INVENTORY_FORM: InventoryFormData = {
  selectedItem: null,
  quantity: 1,
  location: "none",
  weaponSet: shownWeaponSet(0),
  totalCharges: 0,
  remainingCharges: 0,
};

/** The placement as the inventory endpoints take it: a slot equips the item, charges only for items that have them. */
export function placementPayload(data: InventoryFormData, hasCharges: boolean) {
  const location = data.location && data.location !== "none" ? data.location : null;
  return {
    quantity: data.quantity,
    equipped: !!location,
    location,
    totalCharges: hasCharges ? data.totalCharges : null,
    remainingCharges: hasCharges ? data.remainingCharges : null,
    weaponSet: location && HAND_SLOTS.has(location) ? data.weaponSet - 1 : null,
  };
}

/** The item fields placement depends on. */
export type ItemColumns = { type: string | null; slot: string };
type ItemProperties = { type: string; value: string }[];

const HAND_PICKER: LocationValue[] = ["Main Hand", "Off Hand", "Two Handed"];

/** How an item is placed: the slots it can take, whether a weapon set applies, and its charges. */
export function placementProfile(item: ItemColumns, properties: ItemProperties) {
  const isWeapon = item.type === "Weapon";
  const isShield = item.type === "Shield";
  const chargesProperty = properties.find((p) => p.type === "ITEM_HAS_CHARGES");
  const locationOptions: readonly LocationValue[] = isWeapon
    ? HAND_PICKER
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

export type PlacementProfile = ReturnType<typeof placementProfile>;

/** The slot an item goes to when picked, or null to leave the choice (a weapon's hand) to the user. */
export function detectSlotFromItem(item: ItemColumns): LocationValue | null {
  if (item.type === "Weapon") return null; // hand slot picker
  if (item.type === "Armor") return "Torso";
  if (item.type === "Shield") return "Off Hand";
  return LOCATION_OPTIONS.find((v) => v.toLowerCase() === item.slot.toLowerCase()) ?? null;
}

/** Why the slot is taken (by another item, or a two-handed weapon in the same set), if it is. */
export function getSlotConflictWarning(
  location: LocationValue | "none",
  /** As the form shows it, from 1. */
  weaponSet: number,
  inventoryItems: InventoryEntry[],
  excludeItemId?: string,
): string | null {
  if (!location || location === "none") return null;

  const equipped = inventoryItems.filter(
    (e) => e.equipped && e.location && e.itemId !== excludeItemId,
  );

  if (SINGLE_OCCUPANCY_SLOTS.has(location)) {
    const conflict = equipped.find((e) => e.location === location);
    if (conflict) {
      return `${location} slot is occupied by ${conflict.item.name}`;
    }
  }

  if (location === "Finger") {
    const fingerCount = equipped.filter((e) => e.location === "Finger").length;
    if (fingerCount >= 2) {
      return "Both finger slots are occupied";
    }
  }

  if (HAND_SLOTS.has(location)) {
    const sameSet = equipped.filter(
      (e) => !!e.location && HAND_SLOTS.has(e.location) && e.weaponSet !== null && shownWeaponSet(e.weaponSet) === weaponSet,
    );

    if (location === "Two Handed") {
      const conflict = sameSet.find(
        (e) => e.location === "Main Hand" || e.location === "Off Hand",
      );
      if (conflict) {
        return `Cannot equip two-handed: ${conflict.item.name} is in ${conflict.location} (Set ${weaponSet})`;
      }
    }

    if (location === "Main Hand" || location === "Off Hand") {
      const twoHanded = sameSet.find((e) => e.location === "Two Handed");
      if (twoHanded) {
        return `Cannot equip: ${twoHanded.item.name} is two-handed in Set ${weaponSet}`;
      }
      const sameSlot = sameSet.find((e) => e.location === location);
      if (sameSlot) {
        return `${location} is occupied by ${sameSlot.item.name} (Set ${weaponSet})`;
      }
    }
  }

  return null;
}
