/**
 * The SRD 5.2.1's Weapons table: each weapon's definition, which its fields are read from (an item's builders, the
 * codegen's items), its cost and weight its item's; the weapons' categories, properties, mastery properties and damage
 * types; and the unarmed strike every character makes.
 */

/**
 * A weapon's row: its category and whether it's ranged, its damage (and its versatile damage in two hands), its
 * properties, its range (a ranged weapon's, or a thrown one's: normal and long, in feet) and its mastery.
 */
interface WeaponDefinition {
  category: (typeof WEAPON_CATEGORIES)[number];
  damage: string;
  damageType: (typeof DAMAGE_TYPES)[number];
  mastery: (typeof MASTERY_PROPERTIES)[number];
  properties: readonly (typeof WEAPON_PROPERTIES)[number][];
  range?: { long: number; normal: number };
  ranged: boolean;
  /** Its damage in two hands, a Versatile weapon's. */
  versatile?: string;
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
  Club: { category: "Simple", ranged: false, damage: "1d4", damageType: "Bludgeoning", properties: ["Light"], mastery: "Slow" },
  Dagger: { category: "Simple", ranged: false, damage: "1d4", damageType: "Piercing", properties: ["Finesse", "Light", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Nick" },
  Greatclub: { category: "Simple", ranged: false, damage: "1d8", damageType: "Bludgeoning", properties: ["Two-Handed"], mastery: "Push" },
  Handaxe: { category: "Simple", ranged: false, damage: "1d6", damageType: "Slashing", properties: ["Light", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Vex" },
  Javelin: { category: "Simple", ranged: false, damage: "1d6", damageType: "Piercing", properties: ["Thrown"], range: { normal: 30, long: 120 }, mastery: "Slow" },
  "Light Hammer": { category: "Simple", ranged: false, damage: "1d4", damageType: "Bludgeoning", properties: ["Light", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Nick" },
  Mace: { category: "Simple", ranged: false, damage: "1d6", damageType: "Bludgeoning", properties: [], mastery: "Sap" },
  Quarterstaff: { category: "Simple", ranged: false, damage: "1d6", damageType: "Bludgeoning", properties: ["Versatile"], versatile: "1d8", mastery: "Topple" },
  Sickle: { category: "Simple", ranged: false, damage: "1d4", damageType: "Slashing", properties: ["Light"], mastery: "Nick" },
  Spear: { category: "Simple", ranged: false, damage: "1d6", damageType: "Piercing", properties: ["Thrown", "Versatile"], range: { normal: 20, long: 60 }, versatile: "1d8", mastery: "Sap" },
  Dart: { category: "Simple", ranged: true, damage: "1d4", damageType: "Piercing", properties: ["Finesse", "Thrown"], range: { normal: 20, long: 60 }, mastery: "Vex" },
  "Light Crossbow": { category: "Simple", ranged: true, damage: "1d8", damageType: "Piercing", properties: ["Ammunition", "Loading", "Two-Handed"], range: { normal: 80, long: 320 }, mastery: "Slow" },
  Shortbow: { category: "Simple", ranged: true, damage: "1d6", damageType: "Piercing", properties: ["Ammunition", "Two-Handed"], range: { normal: 80, long: 320 }, mastery: "Vex" },
  Sling: { category: "Simple", ranged: true, damage: "1d4", damageType: "Bludgeoning", properties: ["Ammunition"], range: { normal: 30, long: 120 }, mastery: "Slow" },
  Battleaxe: { category: "Martial", ranged: false, damage: "1d8", damageType: "Slashing", properties: ["Versatile"], versatile: "1d10", mastery: "Topple" },
  Flail: { category: "Martial", ranged: false, damage: "1d8", damageType: "Bludgeoning", properties: [], mastery: "Sap" },
  Glaive: { category: "Martial", ranged: false, damage: "1d10", damageType: "Slashing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Graze" },
  Greataxe: { category: "Martial", ranged: false, damage: "1d12", damageType: "Slashing", properties: ["Heavy", "Two-Handed"], mastery: "Cleave" },
  Greatsword: { category: "Martial", ranged: false, damage: "2d6", damageType: "Slashing", properties: ["Heavy", "Two-Handed"], mastery: "Graze" },
  Halberd: { category: "Martial", ranged: false, damage: "1d10", damageType: "Slashing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Cleave" },
  Lance: { category: "Martial", ranged: false, damage: "1d10", damageType: "Piercing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Topple" },
  Longsword: { category: "Martial", ranged: false, damage: "1d8", damageType: "Slashing", properties: ["Versatile"], versatile: "1d10", mastery: "Sap" },
  Maul: { category: "Martial", ranged: false, damage: "2d6", damageType: "Bludgeoning", properties: ["Heavy", "Two-Handed"], mastery: "Topple" },
  Morningstar: { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: [], mastery: "Sap" },
  Pike: { category: "Martial", ranged: false, damage: "1d10", damageType: "Piercing", properties: ["Heavy", "Reach", "Two-Handed"], mastery: "Push" },
  Rapier: { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: ["Finesse"], mastery: "Vex" },
  Scimitar: { category: "Martial", ranged: false, damage: "1d6", damageType: "Slashing", properties: ["Finesse", "Light"], mastery: "Nick" },
  Shortsword: { category: "Martial", ranged: false, damage: "1d6", damageType: "Piercing", properties: ["Finesse", "Light"], mastery: "Vex" },
  Trident: { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: ["Thrown", "Versatile"], range: { normal: 20, long: 60 }, versatile: "1d10", mastery: "Topple" },
  Warhammer: { category: "Martial", ranged: false, damage: "1d8", damageType: "Bludgeoning", properties: ["Versatile"], versatile: "1d10", mastery: "Push" },
  "War Pick": { category: "Martial", ranged: false, damage: "1d8", damageType: "Piercing", properties: ["Versatile"], versatile: "1d10", mastery: "Sap" },
  Whip: { category: "Martial", ranged: false, damage: "1d4", damageType: "Slashing", properties: ["Finesse", "Reach"], mastery: "Slow" },
  Blowgun: { category: "Martial", ranged: true, damage: "1", damageType: "Piercing", properties: ["Ammunition", "Loading"], range: { normal: 25, long: 100 }, mastery: "Vex" },
  "Hand Crossbow": { category: "Martial", ranged: true, damage: "1d6", damageType: "Piercing", properties: ["Ammunition", "Light", "Loading"], range: { normal: 30, long: 120 }, mastery: "Vex" },
  "Heavy Crossbow": { category: "Martial", ranged: true, damage: "1d10", damageType: "Piercing", properties: ["Ammunition", "Heavy", "Loading", "Two-Handed"], range: { normal: 100, long: 400 }, mastery: "Push" },
  Longbow: { category: "Martial", ranged: true, damage: "1d8", damageType: "Piercing", properties: ["Ammunition", "Heavy", "Two-Handed"], range: { normal: 150, long: 600 }, mastery: "Slow" },
  Musket: { category: "Martial", ranged: true, damage: "1d12", damageType: "Piercing", properties: ["Ammunition", "Loading", "Two-Handed"], range: { normal: 40, long: 120 }, mastery: "Slow" },
  Pistol: { category: "Martial", ranged: true, damage: "1d10", damageType: "Piercing", properties: ["Ammunition", "Loading"], range: { normal: 30, long: 90 }, mastery: "Vex" },
};

/** The weapons, the table's, by name. */
export const WEAPON_NAMES = Object.keys(WEAPON_DEFINITIONS).toSorted();

/** The weapons' properties, as the SRD names them. */
export const WEAPON_PROPERTIES = [
  "Ammunition",
  "Finesse",
  "Heavy",
  "Light",
  "Loading",
  "Reach",
  "Thrown",
  "Two-Handed",
  "Versatile",
] as const;
