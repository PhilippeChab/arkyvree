import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Elf Wizard 3 — Skills: (2+4)*4 + (2+4)*2 = 36 */
export default {
  name: "Elara Starweaver",
  links: { race: "Elf" },
  fields: {
    [CHARACTER_XP]: 3000,
    [CHARACTER_ALIGNMENT]: "Neutral Good",
    [CHARACTER_AGE]: 130,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "170",
    [CHARACTER_WEIGHT]: "48",
  },
  description:
    "A studious elven wizard from the Celestial Academy, Elara weaves arcane formulae with mathematical precision. Her spellbook is filled with meticulous notes and elegant diagrams.",
  abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
  languages: ["Common", "Elven", "Draconic", "Sylvan"],
  classes: [{ klass: "Wizard", hp: [4, 3, 3] }],
  // Total skills: 36
  skills: [
    // L1 (24 points)
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Arcana)", rank: 4 },
    { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 },
    { levelIndex: 0, skillName: "Decipher Script", rank: 4 },
    { levelIndex: 0, skillName: "Craft", rank: 4 },
    // L2 (6 points)
    { levelIndex: 1, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 1, skillName: "Concentration", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (Arcana)", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 1, skillName: "Decipher Script", rank: 1 },
    { levelIndex: 1, skillName: "Craft", rank: 1 },
    // L3 (6 points)
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Arcana)", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 2, skillName: "Decipher Script", rank: 1 },
    { levelIndex: 2, skillName: "Craft", rank: 1 },
  ],
  // General feats: floor(3/3)+1 = 2
  feats: [
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 2, featName: "Spell Focus: Evocation", aptitude: "General" },
    // Wizard specialization: Evocation, prohibit Illusion and Necromancy
    { levelIndex: 0, featName: "Evocation Specialist", aptitude: "Wizard Specialization" },
    { levelIndex: 0, featName: "Prohibit Illusion", aptitude: "Prohibited School" },
    { levelIndex: 0, featName: "Prohibit Necromancy", aptitude: "Prohibited School" },
    { levelIndex: 0, featName: "Owl Familiar", aptitude: "Familiar Bond" },
  ],
  // Wizard 3 spellbook: L0=6, L1=5, L2=2
  spells: [
    // Cantrips (6)
    { levelIndex: 0, spellName: "Detect Magic", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Light", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Read Magic", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Mage Hand", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Prestidigitation", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Resistance", aptitude: "Wizard Spells" },
    // Level 1 spellbook (5): 3 starting + 2 at L2
    { levelIndex: 0, spellName: "Magic Missile", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Mage Armor", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Shield", aptitude: "Wizard Spells" },
    { levelIndex: 1, spellName: "Sleep", aptitude: "Wizard Spells" },
    { levelIndex: 1, spellName: "Burning Hands", aptitude: "Wizard Spells" },
    // Level 2 spellbook (2): gained at L3
    { levelIndex: 2, spellName: "Scorching Ray", aptitude: "Wizard Spells" },
    { levelIndex: 2, spellName: "Web", aptitude: "Wizard Spells" },
  ],
  inventory: [{ name: "Quarterstaff", quantity: 1, equipped: true, location: "Two Handed", groups: [0] }],
} satisfies CharacterSeed;
