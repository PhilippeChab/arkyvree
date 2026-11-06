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
 * Human Paladin 4, short of her divine bond (5th level). 15-point buy: Str 15 (7), Dex 11 (1), Con 12 (2), Int 10 (0),
 * Wis 10 (0), Cha 14 (5); her race's +2 to Strength, and her 4th level's increase to Strength (18). Skills: 2 + Int 0 +
 * human 1 = 3 a level. Feats: general at 1 and 3, a human's at 1.
 */
export default {
  name: "Seraphine Valcourt",
  links: { race: "Human" },
  fields: {
    [CHARACTER_XP]: 9_000,
    [CHARACTER_ALIGNMENT]: "Lawful Good",
    [CHARACTER_AGE]: 23,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "175",
    [CHARACTER_WEIGHT]: "68",
  },
  description:
    "The youngest knight of a hospitaller order, Seraphine rides the pilgrim roads to keep them safe, and has yet to find a fight she would walk away from.",
  abilities: { Strength: 15, Dexterity: 11, Constitution: 12, Intelligence: 10, Wisdom: 10, Charisma: 14 },
  languages: ["Common"],
  classes: [{ klass: "Paladin", hp: [10, 9, 6, 8] }],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Strength" }],
  skills: [0, 1, 2, 3].flatMap((levelIndex) => [
    { levelIndex, skillName: "Diplomacy", rank: 1 },
    { levelIndex, skillName: "Ride", rank: 1 },
    { levelIndex, skillName: "Sense Motive", rank: 1 },
  ]),
  feats: [
    { levelIndex: 0, featName: "Racial Ability Score: Strength", aptitude: "Racial Ability Score" },
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 0, featName: "Weapon Focus: Longsword", aptitude: "General" },
    { levelIndex: 2, featName: "Mounted Combat", aptitude: "General" },
  ],
  inventory: [
    { name: "Longsword", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Full Plate", quantity: 1, location: "Armor" },
    { name: "Heavy Steel Shield", quantity: 1, location: "Off Hand", groups: [0] },
  ],
} satisfies TestCharacterSeed;
