/**
 * The SRD 5.2.1's Weapons table: each weapon's definition, which its item's fields are read from (an item's builders,
 * the codegen's items); the weapons' categories, properties, mastery properties and damage types; and the unarmed
 * strike every character makes.
 */

/**
 * A weapon's row: its category and whether it's ranged, its damage (and its versatile damage in two hands), its
 * properties, its range (a ranged weapon's, or a thrown one's: normal and long, in feet), its mastery, its cost and its
 * weight.
 */
interface WeaponDefinition {
  category: (typeof WEAPON_CATEGORIES)[number];
  /** What it costs, in gold pieces (a silver piece is 0.1, a copper piece 0.01). */
  cost: number;
  damage: string;
  damageType: (typeof DAMAGE_TYPES)[number];
  mastery: (typeof MASTERY_PROPERTIES)[number];
  properties: readonly (typeof WEAPON_PROPERTIES)[number][];
  range?: { long: number; normal: number };
  ranged: boolean;
  /** Its damage in two hands, a Versatile weapon's. */
  versatile?: string;
  /** What it weighs, in pounds. */
  weight: number;
}

/** The damage types, as the SRD names them. */
export const DAMAGE_TYPES = [
  "Acid",
  "Bludgeoning",
  "Cold",
  "Fire",
  "Force",
  "Lightning",
  "Necrotic",
  "Piercing",
  "Poison",
  "Psychic",
  "Radiant",
  "Slashing",
  "Thunder",
] as const;

/** The weapons' mastery properties, which a character with Weapon Mastery uses with a weapon of its kind. */
export const MASTERY_PROPERTIES = ["Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex"] as const;

/**
 * The unarmed strike every character makes, with no weapon: 1 + its Strength modifier bludgeoning damage, its attack
 * proficient. It's no weapon, so it takes no mastery.
 */
export const UNARMED_STRIKE = { name: "Unarmed Strike", damage: "1", damageType: "Bludgeoning" } as const;

/** The weapons' categories: the weapon proficiency a class gives is by category. */
export const WEAPON_CATEGORIES = ["Simple", "Martial"] as const;

/** Each weapon's row, by its name, as the table gives it: simple melee, simple ranged, martial melee, martial ranged. */
// oxfmt-ignore
export const WEAPON_DEFINITIONS: Partial<Record<string, WeaponDefinition>> = {
  Club: { category: "Simple", ranged: false, damage: "1d4", damageType: "Bludgeoning", properties: ["Light"], mastery: "Slow", cost: 0.1, weight: 2 },
  Dagger: { category: "Simple", ranged: false, damage: "1d4", damageType: "Piercing", properties: ["Finesse", "Light", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Nick", cost: 2, weight: 1 },
  Greatclub: { category: "Simple", ranged: false, damage: "1d8", damageType: "Bludgeoning", properties: ["Two-Handed"], mastery: "Push", cost: 0.2, weight: 10 },
  Handaxe: { category: "Simple", ranged: false, damage: "1d6", damageType: "Slashing", properties: ["Light", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Vex", cost: 5, weight: 2 },
  Javelin: { category: "Simple", ranged: false, damage: "1d6", damageType: "Piercing", properties: ["Thrown"], range: { normal: 30, long: 120 }, mastery: "Slow", cost: 0.5, weight: 2 },
  "Light Hammer": { category: "Simple", ranged: false, damage: "1d4", damageType: "Bludgeoning", properties: ["Light", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Nick", cost: 2, weight: 2 },
  Mace: { category: "Simple", ranged: false, damage: "1d6", damageType: "Bludgeoning", properties: [], mastery: "Sap", cost: 5, weight: 4 },
  Quarterstaff: { category: "Simple", ranged: false, damage: "1d6", damageType: "Bludgeoning", properties: ["Versatile"], versatile: "1d8", mastery: "Topple", cost: 0.2, weight: 4 },
  Sickle: { category: "Simple", ranged: false, damage: "1d4", damageType: "Slashing", properties: ["Light"], mastery: "Nick", cost: 1, weight: 2 },
  Spear: { category: "Simple", ranged: false, damage: "1d6", damageType: "Piercing", properties: ["Thrown", "Versatile"], range: { normal: 20, long: 60 }, versatile: "1d8", mastery: "Sap", cost: 1, weight: 3 },
  Dart: { category: "Simple", ranged: true, damage: "1d4", damageType: "Piercing", properties: ["Finesse", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Vex", cost: 0.05, weight: 0.25 },
  "Light Crossbow": { category: "Simple", ranged: true, damage: "1d8", damageType: "Piercing", properties: ["Ammunition", "Loading", "Two-Handed"], range: { normal: 80, long: 320 }, mastery: "Slow", cost: 25, weight: 5 },
  Shortbow: { category: "Simple", ranged: true, damage: "1d6", damageType: "Piercing", properties: ["Ammunition", "Two-Handed"], range: { normal: 80, long: 320 }, mastery: "Vex", cost: 25, weight: 2 },
  Sling: { category: "Simple", ranged: true, damage: "1d4", damageType: "Bludgeoning", properties: ["Ammunition"], range: { normal: 30, long: 120 }, mastery: "Slow", cost: 0.1, weight: 0 },
  Battleaxe: { category: "Martial", ranged: false, damage: "1d8", damageType: "Slashing", properties: ["Versatile"], versatile: "1d10", mastery: "Topple", cost: 10, weight: 4 },
  Flail: { category: "Martial", ranged: false, damage: "1d8", damageType: "Bludgeoning", properties: [], mastery: "Sap", cost: 10, weight: 2 },
  Glaive: { category: "Martial", ranged: false, damage: "1d10", damageType: "Slashing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Graze", cost: 20, weight: 6 },
  Greataxe: { category: "Martial", ranged: false, damage: "1d12", damageType: "Slashing", properties: ["Heavy", "Two-Handed"], mastery: "Cleave", cost: 30, weight: 7 },
  Greatsword: { category: "Martial", ranged: false, damage: "2d6", damageType: "Slashing", properties: ["Heavy", "Two-Handed"], mastery: "Graze", cost: 50, weight: 6 },
  Halberd: { category: "Martial", ranged: false, damage: "1d10", damageType: "Slashing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Cleave", cost: 20, weight: 6 },
  Lance: { category: "Martial", ranged: false, damage: "1d10", damageType: "Piercing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Topple", cost: 10, weight: 6 },
  Longsword: { category: "Martial", ranged: false, damage: "1d8", damageType: "Slashing", properties: ["Versatile"], versatile: "1d10", mastery: "Sap", cost: 15, weight: 3 },
  Maul: { category: "Martial", ranged: false, damage: "2d6", damageType: "Bludgeoning", properties: ["Heavy", "Two-Handed"], mastery: "Topple", cost: 10, weight: 10 },
  Morningstar: { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: [], mastery: "Sap", cost: 15, weight: 4 },
  Pike: { category: "Martial", ranged: false, damage: "1d10", damageType: "Piercing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Push", cost: 5, weight: 18 },
  Rapier: { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: ["Finesse"], mastery: "Vex", cost: 25, weight: 2 },
  Scimitar: { category: "Martial", ranged: false, damage: "1d6", damageType: "Slashing", properties: ["Finesse", "Light"], mastery: "Nick", cost: 25, weight: 3 },
  Shortsword: { category: "Martial", ranged: false, damage: "1d6", damageType: "Piercing", properties: ["Finesse", "Light"], mastery: "Vex", cost: 10, weight: 2 },
  Trident: { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: ["Thrown", "Versatile"], range: { normal: 20, long: 60 }, versatile: "1d10", mastery: "Topple", cost: 5, weight: 4 },
  Warhammer: { category: "Martial", ranged: false, damage: "1d8", damageType: "Bludgeoning", properties: ["Versatile"], versatile: "1d10", mastery: "Push", cost: 15, weight: 5 },
  "War Pick": { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: ["Versatile"], versatile: "1d10", mastery: "Sap", cost: 5, weight: 2 },
  Whip: { category: "Martial", ranged: false, damage: "1d4", damageType: "Slashing", properties: ["Finesse", "Reach"], mastery: "Slow", cost: 2, weight: 3 },
  Blowgun: { category: "Martial", ranged: true, damage: "1", damageType: "Piercing", properties: ["Ammunition", "Loading"], range: { normal: 25, long: 100 }, mastery: "Vex", cost: 10, weight: 1 },
  "Hand Crossbow": { category: "Martial", ranged: true, damage: "1d6", damageType: "Piercing", properties: ["Ammunition", "Light", "Loading"], range: { normal: 30, long: 120 }, mastery: "Vex", cost: 75, weight: 3 },
  "Heavy Crossbow": { category: "Martial", ranged: true, damage: "1d10", damageType: "Piercing", properties: ["Ammunition", "Heavy", "Loading", "Two-Handed"], range: { normal: 100, long: 400 }, mastery: "Push", cost: 50, weight: 18 },
  Longbow: { category: "Martial", ranged: true, damage: "1d8", damageType: "Piercing", properties: ["Ammunition", "Heavy", "Two-Handed"], range: { normal: 150, long: 600 }, mastery: "Slow", cost: 50, weight: 2 },
  Musket: { category: "Martial", ranged: true, damage: "1d12", damageType: "Piercing", properties: ["Ammunition", "Loading", "Two-Handed"], range: { normal: 40, long: 120 }, mastery: "Slow", cost: 500, weight: 10 },
  Pistol: { category: "Martial", ranged: true, damage: "1d10", damageType: "Piercing", properties: ["Ammunition", "Loading"], range: { normal: 30, long: 90 }, mastery: "Vex", cost: 250, weight: 3 },
};

/** The weapons, the table's, by name. */
export const WEAPON_NAMES = Object.keys(WEAPON_DEFINITIONS).toSorted();

/**
 * The weapons' properties, as the SRD names them: a weapon's Range is its range fields', which a weapon with the
 * Ammunition or the Thrown property has.
 */
export const WEAPON_PROPERTIES = [
  "Ammunition",
  "Finesse",
  "Heavy",
  "Light",
  "Loading",
  "Range",
  "Reach",
  "Thrown",
  "Two-Handed",
  "Versatile",
] as const;
