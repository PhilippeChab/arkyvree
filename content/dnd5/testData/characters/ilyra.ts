import type { CharacterSeed } from "@/content/dnd5/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd5/fields/index.ts";

/**
 * Wood Elf Sage Wizard 5 (Evoker). Standard array: Str 8, Dex 14, Con 13, Int 15, Wis 12, Cha 10; her background's +2
 * Intelligence and +1 Constitution, and her 4th level's Ability Score Improvement's +1 Dexterity and +1 Intelligence
 * (Dex 15, Con 14, Int 18). Her background's Magic Initiate gives two more cantrips and a level 1 spell on the wizard's
 * list. Her spellbook holds six level 1 spells from her 1st level and two more at each level after, of a level she can
 * cast: her 3rd level's two, counted at level 2, are a level 2 spell and a level 1 one.
 */
export default {
  name: "Ilyra Moonwhisper",
  links: { species: "Elf", background: "Sage" },
  fields: {
    [CHARACTER_XP]: 6500,
    [CHARACTER_ALIGNMENT]: "Neutral Good",
    [CHARACTER_AGE]: 142,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "170",
    [CHARACTER_WEIGHT]: "55",
  },
  description:
    "Raised among the archive-groves of her forest kin, Ilyra left to read the spellbooks the trees could not keep, and keeps a map of every library she has talked her way into.",
  abilities: { Strength: 8, Dexterity: 14, Constitution: 13, Intelligence: 15, Wisdom: 12, Charisma: 10 },
  languages: ["Elvish", "Draconic"],
  classes: [{ klass: "Wizard", hp: [6, 4, 5, 3, 6] }],
  feats: [
    { levelIndex: 0, featName: "Sage: Intelligence +2, Constitution +1", aptitude: "Sage Ability Scores" },
    {
      levelIndex: 0,
      featName: "Magic Initiate (Wizard): Intelligence",
      aptitude: "Magic Initiate (Wizard) Ability",
    },
    { levelIndex: 0, featName: "Elven Lineage: Wood Elf", aptitude: "Elf Lineage" },
    { levelIndex: 0, featName: "Keen Senses: Perception", aptitude: "Keen Senses" },
    { levelIndex: 0, featName: "Skill Proficiency: Investigation", aptitude: "Wizard Skills" },
    { levelIndex: 0, featName: "Skill Proficiency: Medicine", aptitude: "Wizard Skills" },
    { levelIndex: 2, featName: "Evoker", aptitude: "Wizard Subclass" },
    {
      levelIndex: 3,
      featName: "Ability Score Improvement (Dexterity +1, Intelligence +1)",
      aptitude: "Ability Score Improvement",
    },
  ],
  spells: [
    ...["Fire Bolt", "Light", "Mage Hand", "Prestidigitation", "Ray of Frost"].map((spellName) => ({
      levelIndex: 0,
      spellName,
      aptitude: "Wizard Spells",
    })),
    // Her spellbook's six level 1 spells, and her Magic Initiate's
    ...["Detect Magic", "Feather Fall", "Mage Armor", "Magic Missile", "Shield", "Sleep", "Thunderwave"].map(
      (spellName) => ({ levelIndex: 0, spellName, aptitude: "Wizard Spells" }),
    ),
    // Two more at each level after, of a level she can cast
    { levelIndex: 1, spellName: "Burning Hands", aptitude: "Wizard Spells" },
    { levelIndex: 1, spellName: "Chromatic Orb", aptitude: "Wizard Spells" },
    { levelIndex: 2, spellName: "Misty Step", aptitude: "Wizard Spells" },
    { levelIndex: 2, spellName: "Silent Image", aptitude: "Wizard Spells" },
    { levelIndex: 3, spellName: "Minor Illusion", aptitude: "Wizard Spells" },
    { levelIndex: 3, spellName: "Hold Person", aptitude: "Wizard Spells" },
    { levelIndex: 3, spellName: "Invisibility", aptitude: "Wizard Spells" },
    { levelIndex: 4, spellName: "Fireball", aptitude: "Wizard Spells" },
    { levelIndex: 4, spellName: "Counterspell", aptitude: "Wizard Spells" },
  ],
  inventory: [
    { name: "Quarterstaff", quantity: 1, location: "Two Handed", groups: [0] },
    { name: "Dagger", quantity: 1 },
  ],
} satisfies CharacterSeed;
