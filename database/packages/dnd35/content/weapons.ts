import { eq, feat, or } from "@/database/packages/dnd35/content/requirements.ts";
import type { FeatSeed, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";

// The weapons by proficiency, which the weapon feats and the proficiency requirements name.

export const SIMPLE_WEAPONS = [
  "Gauntlet",
  "Unarmed Strike",
  "Dagger",
  "Punching Dagger",
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

/** Being proficient with a simple weapon: with them all, or with it alone. */
export const simple = (weapon: string): RequirementEntry[] => [
  or(eq(feat("Simple Weapon Proficiency")), eq(feat(`Simple Weapon Proficiency: ${weapon}`))),
];
/** Being proficient with a martial weapon: with them all, or with it alone. */
export const martial = (weapon: string): RequirementEntry[] => [
  or(eq(feat("Martial Weapon Proficiency")), eq(feat(`Martial Weapon Proficiency: ${weapon}`))),
];
/** Being proficient with an exotic weapon: with it. */
export const exotic = (weapon: string): RequirementEntry[] => [eq(feat(`Exotic Weapon Proficiency: ${weapon}`))];

/** Being proficient with `weapon`, by its group. */
export function proficiencyRequirements(weapon: string): RequirementEntry[] {
  if (SIMPLE_SET.has(weapon)) return simple(weapon);
  if (MARTIAL_SET.has(weapon)) return martial(weapon);
  return exotic(weapon);
}

/** A proficiency feat per simple and martial weapon: what a class's proficiencies grant, not a character's pick. */
export const weaponProficiencyFeats: FeatSeed[] = [
  ...SIMPLE_WEAPONS.map((w) => ({
    name: `Simple Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    selectable: false,
  })),
  ...MARTIAL_WEAPONS.map((w) => ({
    name: `Martial Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    selectable: false,
  })),
];
