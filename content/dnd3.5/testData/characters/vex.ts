import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Human Sorcerer 3 — Skills: (2+0+1)*4 + (2+0+1)*2 = 18 */
export default {
  name: "Vex Flamecaller",
  links: { race: "Human" },
  fields: {
    [CHARACTER_XP]: 3000,
    [CHARACTER_ALIGNMENT]: "Chaotic Good",
    [CHARACTER_AGE]: 22,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "178",
    [CHARACTER_WEIGHT]: "72",
  },
  description:
    "Born with fire in his veins, Vex discovered his sorcerous bloodline during a childhood accident that left his family barn in ashes. He now channels his innate power with reckless confidence.",
  abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 18 },
  languages: ["Common"],
  classes: [{ klass: "Sorcerer", hp: [4, 3, 4] }],
  // Total skills: 18
  skills: [
    // L1 (12 points)
    { levelIndex: 0, skillName: "Bluff", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    // L2 (3 points)
    { levelIndex: 1, skillName: "Bluff", rank: 1 },
    { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 1, skillName: "Use Magic Device", rank: 1 },
    // L3 (3 points)
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Use Magic Device", rank: 1 },
  ],
  // General feats: floor(3/3)+1 = 2, +1 human bonus = 3
  feats: [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 2, featName: "Dodge", aptitude: "General" },
    { levelIndex: 0, featName: "Cat Familiar", aptitude: "Familiar Bond" },
  ],
  // Sorcerer spells known per level: L1=4 cantrips +2 L1, L2=+1 cantrip, L3=+1 L1
  spells: [
    // L1: 4 cantrips, 2 L1 spells
    { levelIndex: 0, spellName: "Detect Magic", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Light", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Read Magic", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Prestidigitation", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Magic Missile", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Burning Hands", aptitude: "Sorcerer Spells" },
    // L2: +1 cantrip
    { levelIndex: 1, spellName: "Mage Hand", aptitude: "Sorcerer Spells" },
    // L3: +1 L1 spell
    { levelIndex: 2, spellName: "Shield", aptitude: "Sorcerer Spells" },
  ],
  inventory: [
    { name: "Dagger", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Light Crossbow", quantity: 1, location: "Two Handed", groups: [1] },
  ],
} satisfies CharacterSeed;
