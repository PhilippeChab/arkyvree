import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Human Paladin 5 — Skills: (2+0+1)*4 + (2+0+1)*4 = 24. Special Mount unlocks at L5. */
export default {
  name: "Aldric Dawnbringer",
  links: { race: "Human" },
  fields: {
    [CHARACTER_XP]: 10000,
    [CHARACTER_ALIGNMENT]: "Lawful Good",
    [CHARACTER_AGE]: 26,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "185",
    [CHARACTER_WEIGHT]: "95",
  },
  description:
    "A devout human paladin who serves the god of the sun. Aldric swore his oath after witnessing the destruction of his village by undead. He carries a longsword blessed by his temple, rides a celestial-blooded warhorse named Aurelion, and seeks to bring light to the darkest corners of the world.",
  abilities: { Strength: 16, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 12, Charisma: 15 },
  languages: ["Common", "Celestial"],
  classes: [{ klass: "Paladin", hp: [10, 8, 7, 8, 7] }],
  // Total skills: 24
  skills: [
    // L1 (12 points)
    { levelIndex: 0, skillName: "Diplomacy", rank: 4 },
    { levelIndex: 0, skillName: "Heal", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 },
    // L2 (3 points)
    { levelIndex: 1, skillName: "Diplomacy", rank: 1 },
    { levelIndex: 1, skillName: "Sense Motive", rank: 1 },
    { levelIndex: 1, skillName: "Ride", rank: 1 },
    // L3 (3 points)
    { levelIndex: 2, skillName: "Ride", rank: 1 },
    { levelIndex: 2, skillName: "Heal", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    // L4 (3 points)
    { levelIndex: 3, skillName: "Ride", rank: 1 },
    { levelIndex: 3, skillName: "Diplomacy", rank: 1 },
    { levelIndex: 3, skillName: "Sense Motive", rank: 1 },
    // L5 (3 points)
    { levelIndex: 4, skillName: "Ride", rank: 1 },
    { levelIndex: 4, skillName: "Heal", rank: 1 },
    { levelIndex: 4, skillName: "Knowledge (Religion)", rank: 1 },
  ],
  // General feats: L1 + human bonus + L3 = 3. No new general feat at L5
  // (next at L6). The Special Mount race-pick at L5 goes under the
  // "Special Mount Bond" aptitude granted by the L5 class feature.
  feats: [
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 0, featName: "Cleave", aptitude: "General" },
    { levelIndex: 2, featName: "Improved Bull Rush", aptitude: "General" },
    { levelIndex: 4, featName: "Heavy Warhorse Special Mount", aptitude: "Special Mount Bond" },
  ],
  inventory: [
    { name: "Longsword", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Heavy Steel Shield", quantity: 1, location: "Off Hand", groups: [0] },
    { name: "Full Plate", quantity: 1, location: "Torso" },
  ],
} satisfies CharacterSeed;
