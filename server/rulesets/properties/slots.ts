import { location, sizeType } from "@/drizzle/schema.ts";

export const SIZE_ORDER: Record<string, number> = Object.fromEntries(
  sizeType.enumValues.map((size, i) => [size, i]),
);

const WEAPON_LOCATION_MAP = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
} as const;

type WeaponLocation = keyof typeof WEAPON_LOCATION_MAP;

const isWeaponLocation = (loc: string): loc is WeaponLocation =>
  loc in WEAPON_LOCATION_MAP;

export type WeaponSetSlot = (typeof WEAPON_LOCATION_MAP)[WeaponLocation];

export type EquipmentSlot = Lowercase<
  Exclude<(typeof location.enumValues)[number], WeaponLocation>
>;

export type InventorySlot = EquipmentSlot | WeaponSetSlot;

const LOCATION_TO_SLOT: Record<string, InventorySlot> = Object.fromEntries(
  location.enumValues.map((loc) => [
    loc,
    isWeaponLocation(loc)
      ? WEAPON_LOCATION_MAP[loc]
      : loc.toLowerCase() as EquipmentSlot,
  ]),
);

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  ...location.enumValues
    .filter((loc): loc is Exclude<typeof loc, WeaponLocation> => !isWeaponLocation(loc))
    .map((loc) => loc.toLowerCase() as EquipmentSlot),
];

export const WEAPON_SET_SLOTS: WeaponSetSlot[] = Object.values(WEAPON_LOCATION_MAP);

export const ALL_INVENTORY_SLOTS: InventorySlot[] = [
  ...EQUIPMENT_SLOTS, ...WEAPON_SET_SLOTS,
];

export function getInventorySlot(
  type: string | null,
  location: string | null,
): InventorySlot | null {
  if (type === "Armor") return "torso";
  if (type === "Shield") return "offhand";

  if (type === "Weapon" && location) {
    return LOCATION_TO_SLOT[location] ?? null;
  }

  if (location) {
    return LOCATION_TO_SLOT[location] ?? null;
  }

  return null;
}
