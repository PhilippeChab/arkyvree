/**
 * Where equipped items go: every location, the locations that hold one item, the hands, and the item types that set
 * their locations. A worn item's location is its magic item slot, as the Core Rulebook names them: armor, belt, body
 * (robes), chest (mantles, shirts, vests), eyes, feet, hands, head, headband, neck, ring (two), shoulders and wrists; a
 * shield, the book's shield slot, is held in the off hand.
 */

export type HandLocation = (typeof HAND_LOCATIONS)[number];
/** Where an item is worn or held: an inventory entry's location, an item's slot. */
export type ItemLocation = (typeof LOCATION_OPTIONS)[number];

/** The locations a weapon set applies to: the hands. */
export const HAND_LOCATIONS = ["Main Hand", "Off Hand", "Two Handed"] as const satisfies readonly ItemLocation[];

/** The item types that go to set locations, with them: a weapon to a hand, armor to its slot, a shield to the off hand. */
export const ITEM_TYPE_LOCATIONS = {
  Armor: ["Armor"],
  Shield: ["Off Hand"],
  Weapon: HAND_LOCATIONS,
} as const satisfies Record<string, readonly ItemLocation[]>;

/**
 * Every location an item is worn or held in, in the order a slot's select offers them: the slots from head to feet,
 * then the hands, then none (a slotless item's, or one carried).
 */
export const LOCATION_OPTIONS = [
  "Head",
  "Headband",
  "Eyes",
  "Neck",
  "Shoulders",
  "Chest",
  "Body",
  "Armor",
  "Belt",
  "Wrists",
  "Hands",
  "Ring",
  "Feet",
  "Main Hand",
  "Off Hand",
  "Two Handed",
  "Other",
] as const;

/** How many rings a character can wear: the ring slot holds two. */
export const MAX_FINGER_ITEMS = 2;

/** The locations that hold one item: every slot but the ring's. */
export const SINGLE_OCCUPANCY_LOCATIONS = [
  "Head",
  "Headband",
  "Eyes",
  "Neck",
  "Shoulders",
  "Chest",
  "Body",
  "Armor",
  "Belt",
  "Wrists",
  "Hands",
  "Feet",
] as const satisfies readonly ItemLocation[];
