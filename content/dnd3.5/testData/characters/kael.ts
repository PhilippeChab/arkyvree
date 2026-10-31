import type { CharacterSeed } from "@/content/dnd3.5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** Dwarf Fighter 3/Barbarian 1 — Skills: Fighter (2*4+2+2)=12, Barbarian (4)=4 → 16 */
export default {
  name: "Kael Stormborn",
  links: { race: "Dwarf" },
  fields: {
    [CHARACTER_XP]: 6000,
    [CHARACTER_ALIGNMENT]: "Neutral Good",
    [CHARACTER_AGE]: 55,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "135",
    [CHARACTER_WEIGHT]: "85",
  },
  description:
    "A stout dwarven warrior who trained with the mountain guard before discovering a berserker rage deep within. Kael wields a battleaxe passed down from his clan's founder.",
  abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
  languages: ["Common", "Dwarven"],
  classes: [
    { klass: "Fighter", hp: [10, 8, 7] },
    { klass: "Barbarian", hp: [12] },
  ],
  // Total skills: 16
  skills: [
    // Fighter L1 (char level 1, ×4): 2*4 = 8 points
    { levelIndex: 0, skillName: "Climb", rank: 4 },
    { levelIndex: 0, skillName: "Intimidate", rank: 4 },
    // Fighter L2 (2 points)
    { levelIndex: 1, skillName: "Climb", rank: 1 },
    { levelIndex: 1, skillName: "Jump", rank: 1 },
    // Fighter L3 (2 points)
    { levelIndex: 2, skillName: "Intimidate", rank: 1 },
    { levelIndex: 2, skillName: "Swim", rank: 1 },
    // Barbarian L1 (char level 4, ×1): 4 points
    { levelIndex: 3, skillName: "Climb", rank: 1 },
    { levelIndex: 3, skillName: "Intimidate", rank: 1 },
    { levelIndex: 3, skillName: "Jump", rank: 1 },
    { levelIndex: 3, skillName: "Listen", rank: 1 },
  ],
  // General feats: floor(4/3)+1 = 2
  // Fighter Bonus Feats: 2 (from Fighter L1 + L2 modifiers)
  feats: [
    // General
    { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
    { levelIndex: 2, featName: "Toughness", aptitude: "General" },
    // Fighter Bonus
    { levelIndex: 0, featName: "Weapon Focus: Battleaxe", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 1, featName: "Dodge", aptitude: "Fighter Bonus Feat" },
  ],
  inventory: [
    { name: "Battleaxe", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Scale Mail", quantity: 1, location: "Torso" },
    { name: "Heavy Steel Shield", quantity: 1, location: "Off Hand", groups: [0] },
  ],
} satisfies CharacterSeed;
