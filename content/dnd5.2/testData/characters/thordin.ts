import type { CharacterSeed } from "@/content/dnd5.2/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * Dwarf Acolyte Cleric 3 (Life Domain) / Fighter 1. Standard array: Str 14, Dex 10, Con 13, Int 8, Wis 15, Cha 12; his
 * background's +2 Wisdom and +1 Charisma (Wis 17, Cha 13). A fighter's multiclass takes 13 Strength or Dexterity, and
 * his cleric's 13 Wisdom: he has both. His fighter level's proficiencies are a multiclass's (no saving throws, no heavy
 * armor, no skill). His background's Magic Initiate gives two more cantrips and a level 1 spell on the cleric's list,
 * and his Divine Order, a Thaumaturge's, one more cantrip and his Wisdom to his Religion checks.
 */
export default {
  name: "Thordin Ashbeard",
  links: { species: "Dwarf", background: "Acolyte" },
  fields: {
    [CHARACTER_XP]: 2700,
    [CHARACTER_ALIGNMENT]: "Lawful Good",
    [CHARACTER_AGE]: 87,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "135",
    [CHARACTER_WEIGHT]: "80",
    [CHARACTER_DEITY]: "The Forge-Father",
  },
  description:
    "Once the keeper of his clan's hearth-shrine, Thordin took up a warhammer when raiders burned it, and now tends the wounded of whatever company he marches with.",
  abilities: { Strength: 14, Dexterity: 10, Constitution: 13, Intelligence: 8, Wisdom: 15, Charisma: 12 },
  languages: ["Dwarvish", "Giant"],
  classes: [
    { klass: "Cleric", hp: [8, 5, 6] },
    { klass: "Fighter", hp: [7] },
  ],
  feats: [
    { levelIndex: 0, featName: "Acolyte: Wisdom +2, Charisma +1", aptitude: "Acolyte Ability Scores" },
    { levelIndex: 0, featName: "Skill Proficiency: Medicine", aptitude: "Cleric Skills" },
    { levelIndex: 0, featName: "Skill Proficiency: Persuasion", aptitude: "Cleric Skills" },
    { levelIndex: 0, featName: "Divine Order: Thaumaturge", aptitude: "Divine Order" },
    { levelIndex: 2, featName: "Life Domain", aptitude: "Cleric Subclass" },
    { levelIndex: 3, featName: "Defense", aptitude: "Fighting Style" },
    { levelIndex: 3, featName: "Weapon Mastery: Warhammer", aptitude: "Weapon Mastery" },
    { levelIndex: 3, featName: "Weapon Mastery: Light Hammer", aptitude: "Weapon Mastery" },
    { levelIndex: 3, featName: "Weapon Mastery: Handaxe", aptitude: "Weapon Mastery" },
  ],
  spells: [
    ...["Guidance", "Light", "Resistance", "Sacred Flame", "Spare the Dying", "Thaumaturgy"].map((spellName) => ({
      levelIndex: 0,
      spellName,
      aptitude: "Cleric Spells",
    })),
    ...["Bless", "Cure Wounds", "Guiding Bolt", "Healing Word", "Shield of Faith"].map((spellName) => ({
      levelIndex: 0,
      spellName,
      aptitude: "Cleric Spells",
    })),
    { levelIndex: 1, spellName: "Sanctuary", aptitude: "Cleric Spells" },
    { levelIndex: 2, spellName: "Aid", aptitude: "Cleric Spells" },
  ],
  inventory: [
    { name: "Warhammer", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Scale Mail", quantity: 1, location: "Armor" },
    { name: "Shield", quantity: 1, location: "Off Hand", groups: [0] },
  ],
} satisfies CharacterSeed;
