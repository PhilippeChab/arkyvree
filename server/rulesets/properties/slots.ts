import { type ItemLocation, LOCATION_OPTIONS, SIZE_OPTIONS } from "@/shared/enums.ts";
import { type HandLocation, isHandLocation } from "@/shared/equipment.ts";

type WeaponSetSlot = (typeof WEAPON_LOCATION_MAP)[HandLocation];

type EquipmentSlot = Lowercase<Exclude<ItemLocation, HandLocation>>;

type InventorySlot = EquipmentSlot | WeaponSetSlot;

const WEAPON_LOCATION_MAP = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
} as const satisfies Record<HandLocation, string>;

const LOCATION_TO_SLOT: Record<string, InventorySlot> = Object.fromEntries(
  LOCATION_OPTIONS.map((loc) => [
    loc,
    isHandLocation(loc) ? WEAPON_LOCATION_MAP[loc] : (loc.toLowerCase() as EquipmentSlot),
  ]),
);

export const SIZE_ORDER: Record<string, number> = Object.fromEntries(SIZE_OPTIONS.map((size, i) => [size, i]));

export const WEAPON_SET_SLOTS: WeaponSetSlot[] = Object.values(WEAPON_LOCATION_MAP);

export function getInventorySlot(type: string | null, location: string | null): InventorySlot | null {
  if (type === "Armor") return "torso";
  if (type === "Shield") return "offhand";

  return location ? (LOCATION_TO_SLOT[location] ?? null) : null;
}
