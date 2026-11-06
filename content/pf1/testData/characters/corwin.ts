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
 * Human Fighter 5. 15-point buy: Str 15 (7), Dex 13 (3), Con 14 (5), Int 10 (0), Wis 12 (2), Cha 8 (-2); his race's +2
 * to Strength, and his 4th level's increase to Strength (18). Skills: 2 + Int 0 + human 1 = 3 a level. Feats: general
 * at 1, 3 and 5, a human's at 1, a fighter's bonus feat at 1, 2 and 4.
 */
export default {
  name: "Corwin Ashvale",
  links: { race: "Human" },
  fields: {
    [CHARACTER_XP]: 15_000,
    [CHARACTER_ALIGNMENT]: "Lawful Neutral",
    [CHARACTER_AGE]: 27,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "185",
    [CHARACTER_WEIGHT]: "90",
  },
  description:
    "A former caravan guard who sold his sword to the river baronies, Corwin fights behind a heavy shield and a well-kept longsword, and trusts drill over luck.",
  abilities: { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 10, Wisdom: 12, Charisma: 8 },
  languages: ["Common"],
  classes: [{ klass: "Fighter", hp: [10, 7, 8, 6, 9] }],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Strength" }],
  skills: [0, 1, 2, 3, 4].flatMap((levelIndex) => [
    { levelIndex, skillName: "Climb", rank: 1 },
    { levelIndex, skillName: "Intimidate", rank: 1 },
    { levelIndex, skillName: "Swim", rank: 1 },
  ]),
  feats: [
    { levelIndex: 0, featName: "Racial Ability Score: Strength", aptitude: "Racial Ability Score" },
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 0, featName: "Weapon Focus: Longsword", aptitude: "General" },
    { levelIndex: 0, featName: "Cleave", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 1, featName: "Dodge", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 2, featName: "Toughness", aptitude: "General" },
    { levelIndex: 3, featName: "Weapon Specialization: Longsword", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 4, featName: "Improved Initiative", aptitude: "General" },
  ],
  inventory: [
    { name: "Longsword", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Breastplate", quantity: 1, location: "Armor" },
    { name: "Heavy Steel Shield", quantity: 1, location: "Off Hand", groups: [0] },
  ],
} satisfies TestCharacterSeed;
