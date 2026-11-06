import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/pf1/fields/index.ts";

/**
 * Half-Orc Barbarian 2 / Fighter 1. 15-point buy: Str 16 (10), Dex 13 (3), Con 14 (5), Int 9 (-1), Wis 10 (0), Cha 8
 * (-2); her race's +2 to Strength (18). Skills: a barbarian's 4 - 1 = 3 a level, a fighter's 2 - 1 = 1. Feats: general
 * at 1 and 3, a fighter's bonus feat at her fighter level.
 */
export default {
  name: "Mogra Tuskbreaker",
  links: { race: "Half-Orc" },
  fields: {
    [CHARACTER_XP]: 5_000,
    [CHARACTER_ALIGNMENT]: "Chaotic Neutral",
    [CHARACTER_AGE]: 19,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "190",
    [CHARACTER_WEIGHT]: "95",
  },
  description:
    "Raised among the steppe clans and later drilled by a mercenary company, Mogra pairs a berserker's fury with a soldier's footwork, and swings her greataxe with both.",
  abilities: { Strength: 16, Dexterity: 13, Constitution: 14, Intelligence: 9, Wisdom: 10, Charisma: 8 },
  languages: ["Common", "Orc"],
  classes: [
    { klass: "Barbarian", hp: [12, 9] },
    { klass: "Fighter", hp: [7] },
  ],
  skills: [
    { levelIndex: 0, skillName: "Intimidate", rank: 1 },
    { levelIndex: 0, skillName: "Perception", rank: 1 },
    { levelIndex: 0, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Intimidate", rank: 1 },
    { levelIndex: 1, skillName: "Perception", rank: 1 },
    { levelIndex: 1, skillName: "Survival", rank: 1 },
    { levelIndex: 2, skillName: "Climb", rank: 1 },
  ],
  feats: [
    { levelIndex: 0, featName: "Racial Ability Score: Strength", aptitude: "Racial Ability Score" },
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 2, featName: "Cleave", aptitude: "General" },
    { levelIndex: 2, featName: "Weapon Focus: Greataxe", aptitude: "Fighter Bonus Feat" },
  ],
  inventory: [
    { name: "Greataxe", quantity: 1, location: "Two Handed", groups: [0] },
    { name: "Hide Armor", quantity: 1, location: "Armor" },
  ],
} satisfies TestCharacterSeed;
