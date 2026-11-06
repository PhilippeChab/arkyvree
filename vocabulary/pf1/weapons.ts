/**
 * The Core Rulebook's weapons: the weapon table (each base weapon type's definition, which its fields and proficiency
 * are read from; a name the table doesn't have has none), and the weapons by proficiency, which the weapon feats and the
 * proficiency requirements name: the table's, by their proficiency, and the unarmed strike, a simple weapon that's no
 * item. Beside them, the values a weapon's stats take, which an item's fields offer: its families (the fighter's weapon
 * groups), proficiencies, damage types and special qualities, which the table is written in, how Strength applies to its
 * damage, and its names, read off the table. The shields and armor spikes the book's table also lists are armor and
 * shields here, and its ammunition and siege engines no weapons.
 */

import { UNARMED_STRIKE } from "./combat.ts";

interface WeaponDefinition {
  baseDamage: string;
  /** Its critical multiplier: a double weapon's first end's (a gnome hooked hammer's ×3, its hook's ×4 aside). */
  criticalMultiplier: number;
  criticalRange: number;
  /** The damage types the table gives it, in its order: either of them ("P or S"), or both ("B and P"). */
  damageTypes: (typeof DAMAGE_TYPES)[number][];
  /** A double weapon's other end's damage dice (WEAPON_DOUBLE_DAMAGE): in two hands, it fights as two weapons. */
  doubleDamage?: string;
  /**
   * The race that treats it as a martial weapon, its weapon familiarity (a weapon with the race's word in its name): a
   * dwarf's waraxe and urgrosh, an elf's curve blade, a gnome's hooked hammer, a halfling's sling staff, a half-orc's
   * orc double axe.
   */
  familiarity?: string;
  /** The first of its weapon groups, A to Z (its others are `otherFamilies`). */
  family: (typeof WEAPON_FAMILIES)[number];
  finessable?: boolean;
  /**
   * How many range increments its ranged or thrown attack reaches (WEAPON_MAX_RANGE_INCREMENTS): a projectile weapon's
   * ten (a bow, a crossbow, a sling, a blowgun), a net's one ("A net's maximum range is 10 feet"). A thrown weapon
   * without it reaches five.
   */
  maxRangeIncrements?: number;
  /** A composite bow's Strength rating (WEAPON_MIGHTY): its damage's Strength cap, below which it takes −2 to attack. */
  mighty?: number;
  /** Its penalty on attack rolls in one hand (WEAPON_ONE_HANDED_PENALTY): a crossbow's, which takes two hands to load. */
  oneHandedPenalty?: number;
  /**
   * Too large for one hand without training (WEAPON_ONE_HAND_TRAINING): a bastard sword, a dwarven waraxe. A character
   * can use it two-handed as a martial weapon.
   */
  oneHandTraining?: true;
  /** The weapon groups it's in past its family: a dagger's Thrown, a kama's Monk. */
  otherFamilies?: (typeof WEAPON_FAMILIES)[number][];
  proficiency: (typeof WEAPON_PROFICIENCIES)[number];
  range?: number;
  /** A ranged weapon (thrown or projectile, not used in melee), which attacks with Dexterity (WEAPON_RANGED). */
  ranged?: true;
  reach?: number;
  /**
   * Its effort, written as the size of a weapon of that effort for a Medium wielder: Small light, Medium one-handed,
   * Large two-handed. A ranged weapon's is what two-weapon fighting treats it as (a dart, a shuriken, a hand or light
   * crossbow light; a javelin, a sling, a net, a bolas, a heavy crossbow one-handed), and a bow's two-handed, as it
   * needs both hands.
   */
  size: string;
  /** Its special qualities (WEAPON_SPECIAL_QUALITIES): those the table lists but a double weapon's and a reach weapon's. */
  special?: (typeof WEAPON_SPECIAL_QUALITIES)[number][];
  /** How Strength applies to its damage when not by its slot: a bow's "Rating", a crossbow's or a blowgun's "None". */
  strengthDamage?: Exclude<(typeof STRENGTH_DAMAGE_RULES)[number], "Slot">;
}

/**
 * Each entry is the canonical definition for a base weapon type, its damage a Medium one's. All its fields are derived
 * from selecting a weapon type name. The table lists them by proficiency, then light, one-handed, two-handed and ranged,
 * and the weapons by proficiency list them in its order.
 */
// oxfmt-ignore
export const WEAPON_TYPE_DEFINITIONS: Partial<Record<string, WeaponDefinition>> = {
  // Simple
  "Gauntlet": { proficiency: "Simple", family: "Close", baseDamage: "1d3", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", finessable: true },
  "Dagger": { proficiency: "Simple", family: "Blades, Light", otherFamilies: ["Thrown"], baseDamage: "1d4", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing", "Slashing"], size: "Small", range: 10, finessable: true },
  "Punching Dagger": { proficiency: "Simple", family: "Close", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Spiked Gauntlet": { proficiency: "Simple", family: "Close", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Light Mace": { proficiency: "Simple", family: "Hammers", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", finessable: true },
  "Sickle": { proficiency: "Simple", family: "Blades, Light", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], special: ["Trip"], size: "Small", finessable: true },
  "Club": { proficiency: "Simple", family: "Hammers", otherFamilies: ["Thrown"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Medium", range: 10 },
  "Heavy Mace": { proficiency: "Simple", family: "Hammers", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Medium" },
  "Morningstar": { proficiency: "Simple", family: "Flails", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning", "Piercing"], size: "Medium" },
  "Shortspear": { proficiency: "Simple", family: "Spears", otherFamilies: ["Thrown"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", range: 20 },
  "Longspear": { proficiency: "Simple", family: "Spears", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], special: ["Brace"], size: "Large", reach: 10 },
  "Quarterstaff": { proficiency: "Simple", family: "Double", otherFamilies: ["Monk"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, doubleDamage: "1d6", damageTypes: ["Bludgeoning"], special: ["Monk"], size: "Large" },
  "Spear": { proficiency: "Simple", family: "Spears", otherFamilies: ["Thrown"], baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], special: ["Brace"], size: "Large", range: 20 },
  "Blowgun": { proficiency: "Simple", family: "Thrown", baseDamage: "1d2", criticalRange: 1, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, strengthDamage: "None", damageTypes: ["Piercing"], size: "Medium", range: 20 },
  "Heavy Crossbow": { proficiency: "Simple", family: "Crossbows", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, strengthDamage: "None", oneHandedPenalty: -4, damageTypes: ["Piercing"], size: "Medium", range: 120 },
  "Light Crossbow": { proficiency: "Simple", family: "Crossbows", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, strengthDamage: "None", oneHandedPenalty: -2, damageTypes: ["Piercing"], size: "Small", range: 80 },
  "Dart": { proficiency: "Simple", family: "Thrown", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, ranged: true, damageTypes: ["Piercing"], size: "Small", range: 20 },
  "Javelin": { proficiency: "Simple", family: "Spears", otherFamilies: ["Thrown"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, ranged: true, damageTypes: ["Piercing"], size: "Medium", range: 30 },
  "Sling": { proficiency: "Simple", family: "Thrown", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, damageTypes: ["Bludgeoning"], size: "Medium", range: 50 },

  // Martial
  "Throwing Axe": { proficiency: "Martial", family: "Axes", otherFamilies: ["Thrown"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Small", range: 10, finessable: true },
  "Light Hammer": { proficiency: "Martial", family: "Hammers", otherFamilies: ["Thrown"], baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", range: 20, finessable: true },
  "Handaxe": { proficiency: "Martial", family: "Axes", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Small", finessable: true },
  "Kukri": { proficiency: "Martial", family: "Blades, Light", baseDamage: "1d4", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Small", finessable: true },
  "Light Pick": { proficiency: "Martial", family: "Axes", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 4, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Sap": { proficiency: "Martial", family: "Close", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], special: ["Nonlethal"], size: "Small", finessable: true },
  "Starknife": { proficiency: "Martial", family: "Blades, Light", otherFamilies: ["Thrown"], baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Small", range: 20, finessable: true },
  "Short Sword": { proficiency: "Martial", family: "Blades, Light", baseDamage: "1d6", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Battleaxe": { proficiency: "Martial", family: "Axes", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Medium" },
  "Flail": { proficiency: "Martial", family: "Flails", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], special: ["Disarm", "Trip"], size: "Medium" },
  "Longsword": { proficiency: "Martial", family: "Blades, Heavy", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Medium" },
  "Heavy Pick": { proficiency: "Martial", family: "Axes", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 4, damageTypes: ["Piercing"], size: "Medium" },
  "Rapier": { proficiency: "Martial", family: "Blades, Light", baseDamage: "1d6", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", finessable: true },
  "Scimitar": { proficiency: "Martial", family: "Blades, Heavy", baseDamage: "1d6", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Medium" },
  "Trident": { proficiency: "Martial", family: "Spears", otherFamilies: ["Thrown"], baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], special: ["Brace"], size: "Medium", range: 10 },
  "Warhammer": { proficiency: "Martial", family: "Hammers", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Bludgeoning"], size: "Medium" },
  "Falchion": { proficiency: "Martial", family: "Blades, Heavy", baseDamage: "2d4", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Large" },
  "Glaive": { proficiency: "Martial", family: "Pole Arms", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Large", reach: 10 },
  "Greataxe": { proficiency: "Martial", family: "Axes", baseDamage: "1d12", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Large" },
  "Greatclub": { proficiency: "Martial", family: "Hammers", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Large" },
  "Heavy Flail": { proficiency: "Martial", family: "Flails", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], special: ["Disarm", "Trip"], size: "Large" },
  "Greatsword": { proficiency: "Martial", family: "Blades, Heavy", baseDamage: "2d6", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Large" },
  "Guisarme": { proficiency: "Martial", family: "Pole Arms", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], special: ["Trip"], size: "Large", reach: 10 },
  "Halberd": { proficiency: "Martial", family: "Pole Arms", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing", "Slashing"], special: ["Brace", "Trip"], size: "Large" },
  "Lance": { proficiency: "Martial", family: "Spears", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large", reach: 10 },
  "Ranseur": { proficiency: "Martial", family: "Pole Arms", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], special: ["Disarm"], size: "Large", reach: 10 },
  "Scythe": { proficiency: "Martial", family: "Blades, Heavy", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 4, damageTypes: ["Piercing", "Slashing"], special: ["Trip"], size: "Large" },
  "Longbow": { proficiency: "Martial", family: "Bows", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, ranged: true, maxRangeIncrements: 10, strengthDamage: "Rating", damageTypes: ["Piercing"], size: "Large", range: 100 },
  "Composite Longbow": { proficiency: "Martial", family: "Bows", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, ranged: true, maxRangeIncrements: 10, strengthDamage: "Rating", mighty: 0, damageTypes: ["Piercing"], size: "Large", range: 110 },
  "Shortbow": { proficiency: "Martial", family: "Bows", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 3, ranged: true, maxRangeIncrements: 10, strengthDamage: "Rating", damageTypes: ["Piercing"], size: "Large", range: 60 },
  "Composite Shortbow": { proficiency: "Martial", family: "Bows", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 3, ranged: true, maxRangeIncrements: 10, strengthDamage: "Rating", mighty: 0, damageTypes: ["Piercing"], size: "Large", range: 70 },

  // Exotic
  "Kama": { proficiency: "Exotic", family: "Blades, Light", otherFamilies: ["Monk"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], special: ["Monk", "Trip"], size: "Small", finessable: true },
  "Nunchaku": { proficiency: "Exotic", family: "Flails", otherFamilies: ["Monk"], baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], special: ["Disarm", "Monk"], size: "Small", finessable: true },
  "Sai": { proficiency: "Exotic", family: "Monk", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], special: ["Disarm", "Monk"], size: "Small", finessable: true },
  "Siangham": { proficiency: "Exotic", family: "Monk", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], special: ["Monk"], size: "Small", finessable: true },
  "Bastard Sword": { proficiency: "Exotic", family: "Blades, Heavy", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, oneHandTraining: true, damageTypes: ["Slashing"], size: "Medium" },
  "Dwarven Waraxe": { proficiency: "Exotic", family: "Axes", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 3, oneHandTraining: true, damageTypes: ["Slashing"], size: "Medium", familiarity: "Dwarf" },
  "Whip": { proficiency: "Exotic", family: "Flails", baseDamage: "1d3", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], special: ["Disarm", "Nonlethal", "Trip"], size: "Medium", reach: 15, finessable: true },
  "Orc Double Axe": { proficiency: "Exotic", family: "Axes", otherFamilies: ["Double"], baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, doubleDamage: "1d8", damageTypes: ["Slashing"], size: "Large", familiarity: "Half-Orc" },
  "Spiked Chain": { proficiency: "Exotic", family: "Flails", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], special: ["Disarm", "Trip"], size: "Large", finessable: true },
  "Elven Curve Blade": { proficiency: "Exotic", family: "Blades, Heavy", baseDamage: "1d10", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Large", finessable: true, familiarity: "Elf" },
  "Dire Flail": { proficiency: "Exotic", family: "Double", otherFamilies: ["Flails"], baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, doubleDamage: "1d8", damageTypes: ["Bludgeoning"], special: ["Disarm", "Trip"], size: "Large" },
  "Gnome Hooked Hammer": { proficiency: "Exotic", family: "Double", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, doubleDamage: "1d6", damageTypes: ["Bludgeoning", "Piercing"], special: ["Trip"], size: "Large", familiarity: "Gnome" },
  "Two-Bladed Sword": { proficiency: "Exotic", family: "Blades, Heavy", otherFamilies: ["Double"], baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, doubleDamage: "1d8", damageTypes: ["Slashing"], size: "Large" },
  "Dwarven Urgrosh": { proficiency: "Exotic", family: "Double", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, doubleDamage: "1d6", damageTypes: ["Piercing", "Slashing"], special: ["Brace"], size: "Large", familiarity: "Dwarf" },
  "Bolas": { proficiency: "Exotic", family: "Thrown", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, ranged: true, damageTypes: ["Bludgeoning"], special: ["Nonlethal", "Trip"], size: "Medium", range: 10 },
  "Hand Crossbow": { proficiency: "Exotic", family: "Crossbows", baseDamage: "1d4", criticalRange: 2, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, strengthDamage: "None", damageTypes: ["Piercing"], size: "Small", range: 30 },
  "Repeating Heavy Crossbow": { proficiency: "Exotic", family: "Crossbows", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, strengthDamage: "None", oneHandedPenalty: -4, damageTypes: ["Piercing"], size: "Medium", range: 120 },
  "Repeating Light Crossbow": { proficiency: "Exotic", family: "Crossbows", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, ranged: true, maxRangeIncrements: 10, strengthDamage: "None", oneHandedPenalty: -2, damageTypes: ["Piercing"], size: "Small", range: 80 },
  "Net": { proficiency: "Exotic", family: "Thrown", baseDamage: "0", criticalRange: 1, criticalMultiplier: 0, ranged: true, maxRangeIncrements: 1, damageTypes: [], size: "Medium", range: 10 },
  "Shuriken": { proficiency: "Exotic", family: "Monk", otherFamilies: ["Thrown"], baseDamage: "1d2", criticalRange: 1, criticalMultiplier: 2, ranged: true, damageTypes: ["Piercing"], special: ["Monk"], size: "Small", range: 10 },
  "Halfling Sling Staff": { proficiency: "Exotic", family: "Thrown", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, ranged: true, maxRangeIncrements: 10, damageTypes: ["Bludgeoning"], size: "Medium", range: 80, familiarity: "Halfling" },
};

export const EXOTIC_WEAPONS = Object.keys(WEAPON_TYPE_DEFINITIONS).filter(
  (name) => WEAPON_TYPE_DEFINITIONS[name]?.proficiency === "Exotic",
);

export const MARTIAL_WEAPONS = Object.keys(WEAPON_TYPE_DEFINITIONS).filter(
  (name) => WEAPON_TYPE_DEFINITIONS[name]?.proficiency === "Martial",
);

/** The weapons proficiency with every simple weapon covers: the table's, and the unarmed strike. */
export const SIMPLE_WEAPONS = [
  ...Object.keys(WEAPON_TYPE_DEFINITIONS).filter((name) => WEAPON_TYPE_DEFINITIONS[name]?.proficiency === "Simple"),
  UNARMED_STRIKE,
];

export const ALL_WEAPONS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS];

export const CROSSBOW_WEAPONS = ALL_WEAPONS.filter((w) => w.toLowerCase().includes("crossbow"));

/** The damage types a weapon deals, in the order a stat block lists them. */
export const DAMAGE_TYPES = ["Slashing", "Piercing", "Bludgeoning"] as const;

/**
 * How Strength applies to a weapon's damage: by its slot (the hand's share, when none is given: a melee or thrown
 * weapon's, a sling's), up to a bow's rating (a bow that isn't composite takes a penalty, not a bonus), or not at all (a
 * crossbow's, a blowgun's).
 */
export const STRENGTH_DAMAGE_RULES = ["Slot", "Rating", "None"] as const;

/**
 * The families the weapons are grouped in (a feat's or a modifier's targets), by name: the fighter's weapon groups,
 * which his weapon training picks. A weapon may be in several (a dagger in Blades, Light and in Thrown), and Natural
 * holds the unarmed strike and natural attacks alone.
 */
export const WEAPON_FAMILIES = [
  "Axes",
  "Blades, Heavy",
  "Blades, Light",
  "Bows",
  "Close",
  "Crossbows",
  "Double",
  "Flails",
  "Hammers",
  "Monk",
  "Natural",
  "Pole Arms",
  "Spears",
  "Thrown",
] as const;

/** The weapon proficiencies, from the least training to the most. */
export const WEAPON_PROFICIENCIES = ["Simple", "Martial", "Exotic"] as const;

/**
 * The special qualities the weapon table lists, but those another of a weapon's fields gives (a double weapon's, its
 * other end's damage; a reach weapon's, its reach): set against a charge, it deals double damage (brace); it gives +2
 * on combat maneuver checks to disarm (disarm); a monk flurries with it (monk); it deals nonlethal damage (nonlethal);
 * it makes trip attacks, and its wielder drops it rather than be tripped back (trip).
 */
export const WEAPON_SPECIAL_QUALITIES = ["Brace", "Disarm", "Monk", "Nonlethal", "Trip"] as const;

/** The base weapon types, the table's, by name. */
export const WEAPON_TYPE_NAMES = Object.keys(WEAPON_TYPE_DEFINITIONS).toSorted();
