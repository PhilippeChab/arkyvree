import type { HandLocation } from "@/shared/dnd3.5/equipment.ts";
import { type ItemLocation, LOCATION_OPTIONS, SIZE_OPTIONS } from "@/shared/enums.ts";

import ItemPlacement from "./ItemPlacement.ts";

type EquipmentSlot = Lowercase<Exclude<ItemLocation, HandLocation>>;

type InventorySlot = EquipmentSlot | WeaponSetSlot;

type WeaponSetSlot = (typeof WEAPON_LOCATION_MAP)[HandLocation];

const WEAPON_LOCATION_MAP = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
} as const satisfies Record<HandLocation, string>;

const LOCATION_TO_SLOT: Record<string, InventorySlot> = Object.fromEntries(
  LOCATION_OPTIONS.map((loc) => [
    loc,
    ItemPlacement.isHand(loc) ? WEAPON_LOCATION_MAP[loc] : (loc.toLowerCase() as EquipmentSlot),
  ]),
);

export const SIZE_ORDER: Record<string, number> = Object.fromEntries(SIZE_OPTIONS.map((size, i) => [size, i]));

export const WEAPON_SET_SLOTS: WeaponSetSlot[] = Object.values(WEAPON_LOCATION_MAP);

/** An inventory entry's slot, from where it's held. */
export default class InventorySlots {
  static getSlot(type: string | null, location: string | null): InventorySlot | null {
    if (type === "Armor") return "torso";
    if (type === "Shield") return "offhand";

    return location ? (LOCATION_TO_SLOT[location] ?? null) : null;
  }
}
