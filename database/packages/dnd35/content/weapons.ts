import { and, eq, eqStr, feat, gte, or } from "@/database/packages/dnd35/content/requirements.ts";
import type { FeatSeed, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

// The weapons by proficiency, which the weapon feats and the proficiency requirements name.

export const SIMPLE_WEAPONS = [
  "Gauntlet",
  "Unarmed Strike",
  "Dagger",
  "Punching Dagger",
  "Spiked Gauntlet",
  "Light Mace",
  "Sickle",
  "Club",
  "Heavy Mace",
  "Morningstar",
  "Shortspear",
  "Longspear",
  "Quarterstaff",
  "Spear",
  "Heavy Crossbow",
  "Light Crossbow",
  "Dart",
  "Javelin",
  "Sling",
];

export const MARTIAL_WEAPONS = [
  "Throwing Axe",
  "Light Hammer",
  "Handaxe",
  "Kukri",
  "Light Pick",
  "Sap",
  "Short Sword",
  "Battleaxe",
  "Flail",
  "Longsword",
  "Heavy Pick",
  "Rapier",
  "Scimitar",
  "Trident",
  "Warhammer",
  "Falchion",
  "Glaive",
  "Greataxe",
  "Greatclub",
  "Heavy Flail",
  "Greatsword",
  "Guisarme",
  "Halberd",
  "Lance",
  "Ranseur",
  "Scythe",
  "Shortbow",
  "Composite Shortbow",
  "Longbow",
  "Composite Longbow",
];

export const EXOTIC_WEAPONS = [
  "Kama",
  "Nunchaku",
  "Sai",
  "Siangham",
  "Bastard Sword",
  "Dwarven Waraxe",
  "Whip",
  "Orc Double Axe",
  "Spiked Chain",
  "Dire Flail",
  "Two-Bladed Sword",
  "Dwarven Urgrosh",
  "Gnome Hooked Hammer",
  "Shuriken",
  "Hand Crossbow",
  "Repeating Heavy Crossbow",
  "Repeating Light Crossbow",
  "Net",
  "Bolas",
];

export const ALL_WEAPONS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS];

export const CROSSBOW_WEAPONS = ALL_WEAPONS.filter((w) => w.toLowerCase().includes("crossbow"));

const SIMPLE_SET = new Set(SIMPLE_WEAPONS);
const MARTIAL_SET = new Set(MARTIAL_WEAPONS);
/** The exotic weapons "a character can use two-handed as a martial weapon". */
const MARTIAL_IN_TWO_HANDS = new Set(["Bastard Sword", "Dwarven Waraxe"]);

/** The exotic weapons a race treats as martial weapons (its weapon familiarity), by the race. */
const WEAPON_FAMILIARITY: Record<string, string> = {
  "Dwarven Waraxe": "Dwarf",
  "Dwarven Urgrosh": "Dwarf",
  "Gnome Hooked Hammer": "Gnome",
};

/**
 * A proficiency feat per simple and martial weapon. A simple one is what a class's proficiencies grant: a character
 * takes Simple Weapon Proficiency, every simple weapon. A martial one is also the feat a character takes, one weapon at
 * a time (SRD), in the Martial Weapon Proficiency family as an exotic one is in its own: Martial Weapon Proficiency
 * itself, every martial weapon, is a class's.
 */
export const weaponProficiencyFeats: FeatSeed[] = [
  ...SIMPLE_WEAPONS.map((w) => ({
    name: `Simple Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    selectable: false,
    generated: true,
  })),
  ...MARTIAL_WEAPONS.map((w) => ({
    name: `Martial Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    generated: true,
    properties: [{ type: FEAT_FAMILY, value: "Martial Weapon Proficiency" }],
  })),
];

/**
 * Weapon Focus for a kind of spell, a choice the Player's Handbook allows (a ray) and Complete Arcane's Ranged Spell
 * and Touch Spell Specialization require: in the Weapon Focus family, without a weapon to give the bonus to.
 */
export const spellWeaponFocusFeats: FeatSeed[] = ["Ranged Spell", "Touch Spell"].map((spell) => ({
  name: `Weapon Focus: ${spell}`,
  description: `You gain a +1 bonus on attack rolls you make with ${spell.toLowerCase()}s.`,
  generated: true,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [gte("combat.bab", 1)],
  properties: [{ type: FEAT_FAMILY, value: "Weapon Focus" }],
}));

/**
 * Being proficient with an exotic weapon: with it, or with martial weapons when it counts as one, by its wielder's race
 * (a dwarf's waraxe and urgrosh, a gnome's hooked hammer) or, `held`, in two hands (a bastard sword, a dwarven waraxe):
 * what only a weapon's own proficiency reads, a prerequisite holding no weapon.
 */
function exoticProficiency(weapon: string, held: boolean): RequirementEntry[] {
  const asMartial = [
    ...(held && MARTIAL_IN_TWO_HANDS.has(weapon) ? [eqStr("weapon.wielded", "twohanded")] : []),
    ...(weapon in WEAPON_FAMILIARITY ? [eqStr("identity.physiology.race.name", WEAPON_FAMILIARITY[weapon])] : []),
  ];
  const own = eq(feat(`Exotic Weapon Proficiency: ${weapon}`));
  if (asMartial.length === 0) return [own];
  const when = asMartial.length === 1 ? asMartial[0] : or(...asMartial);
  return [or(own, and(eq(feat("Martial Weapon Proficiency")), when))];
}

/**
 * Being proficient with a simple weapon: with them all, or with it alone. A strike with a gauntlet "is otherwise
 * considered an unarmed attack": the unarmed strike's proficiency is the gauntlet's too.
 */
export function simple(weapon: string): RequirementEntry[] {
  return [
    or(
      eq(feat("Simple Weapon Proficiency")),
      eq(feat(`Simple Weapon Proficiency: ${weapon}`)),
      ...(weapon === "Gauntlet" ? [eq(feat("Simple Weapon Proficiency: Unarmed Strike"))] : []),
    ),
  ];
}
/** Being proficient with a martial weapon: with them all, or with it alone. */
export function martial(weapon: string): RequirementEntry[] {
  return [or(eq(feat("Martial Weapon Proficiency")), eq(feat(`Martial Weapon Proficiency: ${weapon}`)))];
}

/** An exotic weapon's proficiency, which the weapon requires: in two hands too. */
export function exotic(weapon: string): RequirementEntry[] {
  return exoticProficiency(weapon, true);
}

/** Being proficient with `weapon`, by its group. */
export function proficiencyRequirements(weapon: string): RequirementEntry[] {
  if (SIMPLE_SET.has(weapon)) return simple(weapon);
  if (MARTIAL_SET.has(weapon)) return martial(weapon);
  return exoticProficiency(weapon, false);
}
