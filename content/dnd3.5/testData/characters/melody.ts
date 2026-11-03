import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Half-Elf Bard 3 — Skills: (6+2)*4 + (6+2)*2 = 48 */
export default {
  name: "Melody Silverveil",
  links: { race: "Half-Elf" },
  fields: {
    [CHARACTER_XP]: 3000,
    [CHARACTER_ALIGNMENT]: "Chaotic Good",
    [CHARACTER_AGE]: 28,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "168",
    [CHARACTER_WEIGHT]: "58",
  },
  description:
    "A half-elven bard whose honeyed voice can charm a dragon or rally an army. Melody travels from court to tavern, collecting stories and songs — and occasionally picking up secrets she shouldn't know.",
  abilities: { Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 14, Wisdom: 10, Charisma: 16 },
  languages: ["Common", "Elven", "Sylvan"],
  classes: [{ klass: "Bard", hp: [5, 4, 6] }],
  // Total skills: 48
  skills: [
    // L1 (32 points)
    { levelIndex: 0, skillName: "Perform", rank: 4 },
    { levelIndex: 0, skillName: "Diplomacy", rank: 4 },
    { levelIndex: 0, skillName: "Bluff", rank: 4 },
    { levelIndex: 0, skillName: "Sense Motive", rank: 4 },
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    { levelIndex: 0, skillName: "Use Magic Device", rank: 4 },
    { levelIndex: 0, skillName: "Gather Information", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
    // L2 (8 points)
    { levelIndex: 1, skillName: "Perform", rank: 1 },
    { levelIndex: 1, skillName: "Diplomacy", rank: 1 },
    { levelIndex: 1, skillName: "Listen", rank: 1 },
    { levelIndex: 1, skillName: "Hide", rank: 1 },
    { levelIndex: 1, skillName: "Move Silently", rank: 1 },
    { levelIndex: 1, skillName: "Tumble", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (Local)", rank: 1 },
    { levelIndex: 1, skillName: "Knowledge (History)", rank: 1 },
    // L3 (8 points)
    { levelIndex: 2, skillName: "Perform", rank: 1 },
    { levelIndex: 2, skillName: "Bluff", rank: 1 },
    { levelIndex: 2, skillName: "Listen", rank: 1 },
    { levelIndex: 2, skillName: "Spellcraft", rank: 1 },
    { levelIndex: 2, skillName: "Concentration", rank: 1 },
    { levelIndex: 2, skillName: "Sense Motive", rank: 1 },
    { levelIndex: 2, skillName: "Hide", rank: 1 },
    { levelIndex: 2, skillName: "Move Silently", rank: 1 },
  ],
  // General feats: floor(3/3)+1 = 2
  feats: [
    { levelIndex: 0, featName: "Dodge", aptitude: "General" },
    { levelIndex: 2, featName: "Combat Casting", aptitude: "General" },
  ],
  // Bard spells known per level: L1=4 cantrips, L2=+1 cantrip +2 L1, L3=+1 cantrip +1 L1
  spells: [
    // L1: 4 cantrips
    { levelIndex: 0, spellName: "Detect Magic", aptitude: "Bard Spells" },
    { levelIndex: 0, spellName: "Light", aptitude: "Bard Spells" },
    { levelIndex: 0, spellName: "Ghost Sound", aptitude: "Bard Spells" },
    { levelIndex: 0, spellName: "Prestidigitation", aptitude: "Bard Spells" },
    // L2: +1 cantrip, +2 L1 spells
    { levelIndex: 1, spellName: "Message", aptitude: "Bard Spells" },
    { levelIndex: 1, spellName: "Charm Person", aptitude: "Bard Spells" },
    { levelIndex: 1, spellName: "Cure Light Wounds", aptitude: "Bard Spells" },
    // L3: +1 cantrip, +1 L1 spell
    { levelIndex: 2, spellName: "Mage Hand", aptitude: "Bard Spells" },
    { levelIndex: 2, spellName: "Sleep", aptitude: "Bard Spells" },
  ],
  inventory: [
    { name: "Rapier", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Studded Leather", quantity: 1, location: "Torso" },
  ],
} satisfies CharacterSeed;
