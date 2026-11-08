/**
 * Where equipped items go: every location, the locations that hold one item, the hands, and the item types that set
 * their locations. A worn item's location is where the SRD 5.2.1 says it's worn: one suit of armor, one item of
 * headwear, one cloak, one pair of bracers, of gloves or gauntlets, and of footwear; rings on fingers; a Shield, held in
 * the off hand. A character attunes to three magic items at most.
 */

export type HandLocation = (typeof HAND_LOCATIONS)[number];
/** Where an item is worn or held: an inventory entry's location, an item's slot. */
export type ItemLocation = (typeof LOCATION_OPTIONS)[number];

/** The locations a weapon set applies to: the hands. */
export const HAND_LOCATIONS = ["Main Hand", "Off Hand", "Two Handed"] as const satisfies readonly ItemLocation[];

/** The item types that go to set locations, with them: a weapon to a hand, armor to its own, a Shield to the off hand. */
export const ITEM_TYPE_LOCATIONS = {
  Armor: ["Armor"],
  Shield: ["Off Hand"],
  Weapon: HAND_LOCATIONS,
} as const satisfies Record<string, readonly ItemLocation[]>;

/**
 * Every location an item is worn or held in, in the order a slot's select offers them: the body's from head to feet,
 * then the hands, then none (an item worn elsewhere, or carried).
 */
export const LOCATION_OPTIONS = [
  "Head",
  "Shoulders",
  "Armor",
  "Wrists",
  "Hands",
  "Ring",
  "Feet",
  "Main Hand",
  "Off Hand",
  "Two Handed",
  "Other",
] as const;

/** The most magic items a character is attuned to at a time: 3. */
export const MAX_ATTUNED_ITEMS = 3;

/** The locations that hold one item: every one of the body's but the rings'. */
export const SINGLE_OCCUPANCY_LOCATIONS = [
  "Head",
  "Shoulders",
  "Armor",
  "Wrists",
  "Hands",
  "Feet",
] as const satisfies readonly ItemLocation[];
