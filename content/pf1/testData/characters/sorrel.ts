import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/pf1/fields/index.ts";

/** The skills he raises a rank at each level: six, as his 6 points a level buy. */
const SKILLS = ["Perception", "Stealth", "Survival", "Knowledge (Nature)", "Handle Animal", "Climb"];

/**
 * Half-Elf Ranger 6, an archer with a wolf companion. 15-point buy: Str 14 (5), Dex 15 (7), Con 12 (2), Int 11 (1),
 * Wis 12 (2), Cha 8 (-2); his race's +2 to Dexterity, and his 4th level's increase to Dexterity (18). Skills: 6 + Int 0
 * = 6 a level. Feats: general at 1, 3 and 5; archery combat style feats at 2 and 6; Endurance granted at 3; favored
 * enemies at 1 and 5, the 5th level's specialization raising the first; his hunter's bond a wolf at 4.
 */
export default {
  name: "Sorrel Brightwater",
  links: { race: "Half-Elf" },
  fields: {
    [CHARACTER_XP]: 23_000,
    [CHARACTER_ALIGNMENT]: "Neutral Good",
    [CHARACTER_AGE]: 34,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "178",
    [CHARACTER_WEIGHT]: "70",
  },
  description:
    "A border warden of the old forest marches, Sorrel hunts the goblin raiders that cross the river each autumn, with his wolf Ash ranging ahead of him.",
  abilities: { Strength: 14, Dexterity: 15, Constitution: 12, Intelligence: 11, Wisdom: 12, Charisma: 8 },
  languages: ["Common", "Elven"],
  classes: [{ klass: "Ranger", hp: [10, 8, 7, 9, 6, 8] }],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Dexterity" }],
  skills: [0, 1, 2, 3, 4, 5].flatMap((levelIndex) => SKILLS.map((skillName) => ({ levelIndex, skillName, rank: 1 }))),
  feats: [
    { levelIndex: 0, featName: "Racial Ability Score: Dexterity", aptitude: "Racial Ability Score" },
    { levelIndex: 0, featName: "Point-Blank Shot", aptitude: "General" },
    { levelIndex: 0, featName: "Favored Enemy: Humanoid (Goblinoid)", aptitude: "Favored Enemy" },
    { levelIndex: 1, featName: "Rapid Shot", aptitude: "Ranger Combat Style (2nd)" },
    { levelIndex: 2, featName: "Precise Shot", aptitude: "General" },
    { levelIndex: 3, featName: "Hunter's Bond: Animal Companion", aptitude: "Hunter's Bond" },
    { levelIndex: 3, featName: "Wolf Animal Companion", aptitude: "Animal Companion Bond" },
    { levelIndex: 4, featName: "Deadly Aim", aptitude: "General" },
    { levelIndex: 4, featName: "Favored Enemy: Animal", aptitude: "Favored Enemy" },
    {
      levelIndex: 4,
      featName: "Favored Enemy Specialization: Humanoid (Goblinoid)",
      aptitude: "Favored Enemy Specialization",
    },
    { levelIndex: 5, featName: "Manyshot", aptitude: "Ranger Combat Style (6th)" },
  ],
  inventory: [
    { name: "Longbow", quantity: 1, location: "Two Handed", groups: [0] },
    { name: "Studded Leather", quantity: 1, location: "Armor" },
  ],
} satisfies TestCharacterSeed;
