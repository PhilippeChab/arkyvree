import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/pf1/fields/index.ts";

/** The skills she raises a rank at each level: ten, as her 10 points a level buy. */
const SKILLS = [
  "Acrobatics",
  "Bluff",
  "Climb",
  "Disable Device",
  "Escape Artist",
  "Knowledge (Local)",
  "Perception",
  "Sense Motive",
  "Sleight of Hand",
  "Stealth",
];

/**
 * Halfling Rogue 4. 15-point buy: Str 10 (0), Dex 15 (7), Con 12 (2), Int 14 (5), Wis 10 (0), Cha 11 (1); her race's
 * +2 Dex, +2 Cha, -2 Str, and her 4th level's increase to Dexterity (18). Skills: 8 + Int 2 = 10 a level. Feats: general
 * at 1 and 3.
 */
export default {
  name: "Wren Underbough",
  links: { race: "Halfling" },
  fields: {
    [CHARACTER_XP]: 9_000,
    [CHARACTER_ALIGNMENT]: "Chaotic Good",
    [CHARACTER_AGE]: 26,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "92",
    [CHARACTER_WEIGHT]: "16",
  },
  description:
    "A dockside locksmith's apprentice who found other people's locks more interesting than her master's, Wren now opens doors for whoever pays best and asks the fewest questions.",
  abilities: { Strength: 10, Dexterity: 15, Constitution: 12, Intelligence: 14, Wisdom: 10, Charisma: 11 },
  languages: ["Common", "Halfling", "Dwarven", "Elven"],
  classes: [{ klass: "Rogue", hp: [8, 5, 6, 4] }],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Dexterity" }],
  skills: [0, 1, 2, 3].flatMap((levelIndex) => SKILLS.map((skillName) => ({ levelIndex, skillName, rank: 1 }))),
  feats: [
    { levelIndex: 0, featName: "Weapon Finesse", aptitude: "General" },
    { levelIndex: 2, featName: "Dodge", aptitude: "General" },
  ],
  inventory: [
    { name: "Short Sword", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Leather Armor", quantity: 1, location: "Armor" },
  ],
} satisfies TestCharacterSeed;
