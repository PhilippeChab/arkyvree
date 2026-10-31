/** Where an item goes: the locations its type sets, the hands a weapon set applies to, and where an entry is worn. */

import type { Item } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import {
  HAND_LOCATIONS,
  type HandLocation,
  ITEM_TYPE_LOCATIONS,
  type ItemLocation,
  LOCATION_OPTIONS,
} from "@/vocabulary/dnd3.5/equipment.ts";
import { ITEM_HAS_CHARGES, ITEM_SLOT, ITEM_TYPE, WEAPON_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";
import { SIZE_OPTIONS } from "@/vocabulary/dnd3.5/sizes.ts";

/** An inventory entry, as where it's worn reads it. */
interface HeldEntry {
  /** The weapon sets a hand holds it in (its groups), stored from 0; none outside the hands. */
  groups: number[];
  location: string | null;
}

/**
 * An item, as its placement reads it: its fields (its template's of those it holds none of among them): its type, the
 * slot it's worn in (`"Other"` for none), its weapon's size, its charges.
 */
interface PlacedItem {
  fields: Item["fields"];
}

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
  locations: { grouped: boolean; location: ItemLocation }[];
  slot: ItemLocation | null;
}

/**
 * The weapon sizes that take both hands, as the weapon table gives them for a Medium wielder, whatever the wielder's
 * size: Large and past it (a greatsword, a bow).
 */
const TWO_HANDED_SIZES = SIZE_OPTIONS.slice(SIZE_OPTIONS.indexOf("Large"));

/**
 * Where an item goes: a weapon to a hand its wielder picks, body armor to the torso, a shield to the off hand, any
 * other item to its own slot (or anywhere, for one worn nowhere in particular); and where an entry is worn.
 */
export default class ItemPlacement {
  /** The charges an item comes with: its `ITEM_HAS_CHARGES` count (0 when it names none), none without the field. */
  private static chargesOf(item: PlacedItem) {
    const charges = item.fields[ITEM_HAS_CHARGES];
    return charges === undefined ? null : Number.parseInt(String(charges), 10) || 0;
  }

  /** The locations an item of `type` goes to when its type sets them (a weapon's hands), else none: any. */
  private static locationsOf(type: string | null): readonly ItemLocation[] | undefined {
    return ItemPlacement.isLocatedType(type) ? ITEM_TYPE_LOCATIONS[type] : undefined;
  }

  /**
   * The locations an item can take: its type's (both hands alone for a two-handed weapon), else its own slot when it's
   * worn nowhere in particular, else any.
   */
  private static offeredLocations(item: PlacedItem): readonly ItemLocation[] {
    const { [ITEM_SLOT]: slot, [ITEM_TYPE]: type = null, [WEAPON_SIZE]: held } = item.fields;
    const size = held === undefined ? undefined : String(held);
    if (type === "Weapon" && ItemPlacement.isTwoHanded(size)) return ["Two Handed"];
    return ItemPlacement.locationsOf(type) ?? (slot === "Other" ? ["Other"] : LOCATION_OPTIONS);
  }

  /**
   * How an item is placed (`item`, its template's fields among its own): where it goes once picked (the one location its
   * type sets, none for a weapon's hand, else its own slot), the locations it can take (a weapon's or a shield's form
   * asks for a weapon set in a hand), and its charges.
   */
  static describe(item: PlacedItem): ItemPlacementDescription {
    const { [ITEM_SLOT]: slot, [ITEM_TYPE]: type = null } = item.fields;
    const typeLocations = ItemPlacement.locationsOf(type);
    const asksWeaponSet = type === "Weapon" || type === "Shield";
    return {
      charges: ItemPlacement.chargesOf(item),
      hand: type === "Weapon",
      locations: ItemPlacement.offeredLocations(item).map((location) => ({
        location,
        grouped: asksWeaponSet && ItemPlacement.isHand(location),
      })),
      slot: typeLocations ? (typeLocations.length === 1 ? typeLocations[0] : null) : slot,
    };
  }

  /**
   * Where an entry is worn, its weapon sets counted from 1 in a hand ("Main Hand (Set 1)", "Off Hand (Sets 1, 2)"), or
   * none when it's carried.
   */
  static describeSlot(entry: HeldEntry): string | null {
    if (!entry.location) return null;
    if (!ItemPlacement.isHand(entry.location) || entry.groups.length === 0) return entry.location;

    const sets = entry.groups.map((set) => set + 1).join(", ");
    return `${entry.location} (${entry.groups.length === 1 ? "Set" : "Sets"} ${sets})`;
  }

  /** The weapon sets a hand's entry is in, stored from 0: the first, for an entry stored without one. */
  static heldSets(entry: Pick<HeldEntry, "groups">): number[] {
    return entry.groups.length > 0 ? entry.groups : [0];
  }

  /** Whether `location` is a hand, which a weapon set applies to. */
  static isHand(location: unknown): location is HandLocation {
    return isOneOf(location, HAND_LOCATIONS);
  }

  /** Whether `type` sets the locations its items go to: a weapon, body armor or a shield. */
  static isLocatedType(type: string | null): type is LocatedItemType {
    return type !== null && Object.hasOwn(ITEM_TYPE_LOCATIONS, type);
  }

  /** Whether a weapon of `size` (its `WEAPON_SIZE`) takes both hands: Large or past it. */
  static isTwoHanded(size: string | null | undefined) {
    return isOneOf(size, TWO_HANDED_SIZES);
  }

  /** The location an item of `type` goes to when its type sets that one alone (body armor's torso, a shield's off hand). */
  static slotOfType(type: string | null): ItemLocation | undefined {
    const locations = ItemPlacement.locationsOf(type);
    return locations?.length === 1 ? locations[0] : undefined;
  }
}
