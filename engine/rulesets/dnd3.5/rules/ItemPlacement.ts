/** Where an item goes: the locations its type sets, the hands a weapon set applies to, and where an entry is worn. */

import { type ItemLocation, LOCATION_OPTIONS } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Property } from "@/shared/relations.ts";
import { HAND_LOCATIONS, type HandLocation, ITEM_TYPE_LOCATIONS } from "@/vocabulary/dnd3.5/equipment.ts";
import { ITEM_HAS_CHARGES } from "@/vocabulary/dnd3.5/properties/index.ts";

/** An inventory entry, as where it's worn reads it. */
interface HeldEntry {
  equipped: boolean;
  location: string | null;
  /** Stored from 0; null outside the hands. */
  weaponSet: number | null;
}

/** An item, as its placement reads it: its type, and the slot it's worn in (`"Other"` for none). */
interface PlacedItem {
  slot: ItemLocation;
  type: string | null;
}

/** An item's property, as its placement reads it. */
type ItemProperty = Pick<Property, "type" | "value">;

/** An item type that sets the locations its items go to (`ITEM_TYPE_LOCATIONS`). */
type LocatedItemType = keyof typeof ITEM_TYPE_LOCATIONS;

/**
 * How an item is placed, as the inventory dialogs offer it: the charges it comes with (none for an item without
 * charges), whether it's held in a hand its wielder picks (`hand`: a weapon), the locations it can take, each with
 * whether its form asks for a weapon set there, and the location it goes to once picked (`slot`: none leaves the
 * choice).
 */
export interface ItemPlacementDescription {
  charges: number | null;
  hand: boolean;
  locations: { location: ItemLocation; weaponSet: boolean }[];
  slot: ItemLocation | null;
}

/**
 * Where an item goes: a weapon to a hand its wielder picks, body armor to the torso, a shield to the off hand, any
 * other item to its own slot (or anywhere, for one worn nowhere in particular); and where an entry is worn.
 */
export default class ItemPlacement {
  /** The charges an item comes with: its `ITEM_HAS_CHARGES` count (0 when it names none), none without the property. */
  private static chargesOf(properties: ItemProperty[]) {
    const charges = properties.find((property) => property.type === ITEM_HAS_CHARGES);
    return charges ? Number.parseInt(charges.value, 10) || 0 : null;
  }

  /** The locations an item of `type` goes to when its type sets them (a weapon's hands), else none: any. */
  private static locationsOf(type: string | null): readonly ItemLocation[] | undefined {
    return ItemPlacement.isLocatedType(type) ? ITEM_TYPE_LOCATIONS[type] : undefined;
  }

  /** The locations an item can take: its type's, else its own slot when it's worn nowhere in particular, else any. */
  private static offeredLocations(item: PlacedItem): readonly ItemLocation[] {
    return ItemPlacement.locationsOf(item.type) ?? (item.slot === "Other" ? ["Other"] : LOCATION_OPTIONS);
  }

  /**
   * How an item is placed: where it goes once picked (the one location its type sets, none for a weapon's hand, else its
   * own slot), the locations it can take (a weapon's or a shield's form asks for a weapon set in a hand), and its charges.
   */
  static describe(item: PlacedItem, properties: ItemProperty[]): ItemPlacementDescription {
    const typeLocations = ItemPlacement.locationsOf(item.type);
    const asksWeaponSet = item.type === "Weapon" || item.type === "Shield";
    return {
      charges: ItemPlacement.chargesOf(properties),
      hand: item.type === "Weapon",
      locations: ItemPlacement.offeredLocations(item).map((location) => ({
        location,
        weaponSet: asksWeaponSet && ItemPlacement.isHand(location),
      })),
      slot: typeLocations ? (typeLocations.length === 1 ? typeLocations[0] : null) : item.slot,
    };
  }

  /** Where an entry is worn, its weapon set counted from 1 in a hand ("Main Hand (Set 1)"), or none when it's carried. */
  static describeSlot(entry: HeldEntry): string | null {
    if (!entry.equipped || !entry.location) return null;
    if (ItemPlacement.isHand(entry.location) && entry.weaponSet !== null)
      return `${entry.location} (Set ${entry.weaponSet + 1})`;

    return entry.location;
  }

  /** Whether `location` is a hand, which a weapon set applies to. */
  static isHand(location: unknown): location is HandLocation {
    return isOneOf(location, HAND_LOCATIONS);
  }

  /** Whether `type` sets the locations its items go to: a weapon, body armor or a shield. */
  static isLocatedType(type: string | null): type is LocatedItemType {
    return type !== null && Object.hasOwn(ITEM_TYPE_LOCATIONS, type);
  }

  /** The location an item of `type` goes to when its type sets that one alone (body armor's torso, a shield's off hand). */
  static slotOfType(type: string | null): ItemLocation | undefined {
    const locations = ItemPlacement.locationsOf(type);
    return locations?.length === 1 ? locations[0] : undefined;
  }
}
