import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Human Cleric 3 — Skills: (2+1+1)*4 + (2+1+1)*2 = 24 */
export default {
  name: "Theron Lightbringer",
  links: { race: "Human" },
  fields: {
    [CHARACTER_XP]: 3000,
    [CHARACTER_ALIGNMENT]: "Lawful Good",
    [CHARACTER_AGE]: 35,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "183",
    [CHARACTER_WEIGHT]: "85",
  },
  description:
    "A devout cleric of Pelor, Theron travels the land healing the sick and smiting the undead. His unwavering faith radiates through his warm smile and the golden symbol he wears.",
  abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
  languages: ["Common", "Celestial"],
  classes: [{ klass: "Cleric", hp: [8, 6, 7] }],
  // Total skills: 24
  skills: [
    // L1 (16 points)
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Heal", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 },
    { levelIndex: 0, skillName: "Diplomacy", rank: 4 },
    // L2 (4 points)
    { levelIndex: 1, skillName: "Concentration", rank: 1 },
    { levelIndex: 1, skillName: "Diplomacy", rank: 1 },
    { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 1, skillName: "Heal", rank: 1 },
    // L3 (4 points)
    { levelIndex: 2, skillName: "Heal", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
  ],
  // General feats: floor(3/3)+1 = 2, +1 human bonus = 3
  feats: [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 2, featName: "Extra Turning", aptitude: "General" },
    // Cleric domains: 2 picks at level 1
    { levelIndex: 0, featName: "Healing Domain", aptitude: "Cleric Domain" },
    { levelIndex: 0, featName: "Sun Domain", aptitude: "Cleric Domain" },
  ],
  // Clerics know all spells on their list — no spell picks needed
  inventory: [
    { name: "Heavy Mace", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Chain Mail", quantity: 1, location: "Torso" },
    { name: "Heavy Steel Shield", quantity: 1, location: "Off Hand", groups: [0] },
  ],
} satisfies CharacterSeed;
