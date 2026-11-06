import type { CharacterSeed } from "@/content/dnd5.2/builders/characters/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * Halfling Criminal Rogue 3 (Thief). Standard array: Str 8, Dex 15, Con 14, Int 13, Wis 12, Cha 10; her background's
 * increases spread +1 to each of its three abilities (Dex 16, Con 15, Int 14). Her background grants Alert, Sleight of
 * Hand, Stealth and Thieves' Tools; her rogue's Expertise doubles her Proficiency Bonus in Stealth and Perception.
 */
export default {
  name: "Sable Underleaf",
  links: { species: "Halfling", background: "Criminal" },
  fields: {
    [CHARACTER_XP]: 900,
    [CHARACTER_ALIGNMENT]: "Chaotic Neutral",
    [CHARACTER_AGE]: 24,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "92",
    [CHARACTER_WEIGHT]: "18",
  },
  description:
    "A fence's apprentice from the river docks, Sable can name the owner of any purse by its stitching, and has returned some of them.",
  abilities: { Strength: 8, Dexterity: 15, Constitution: 14, Intelligence: 13, Wisdom: 12, Charisma: 10 },
  languages: ["Halfling", "Goblin"],
  classes: [{ klass: "Rogue", hp: [8, 5, 6] }],
  feats: [
    {
      levelIndex: 0,
      featName: "Criminal: Dexterity +1, Constitution +1, Intelligence +1",
      aptitude: "Criminal Ability Scores",
    },
    { levelIndex: 0, featName: "Skill Proficiency: Acrobatics", aptitude: "Rogue Skills" },
    { levelIndex: 0, featName: "Skill Proficiency: Deception", aptitude: "Rogue Skills" },
    { levelIndex: 0, featName: "Skill Proficiency: Investigation", aptitude: "Rogue Skills" },
    { levelIndex: 0, featName: "Skill Proficiency: Perception", aptitude: "Rogue Skills" },
    { levelIndex: 0, featName: "Expertise: Stealth", aptitude: "Expertise" },
    { levelIndex: 0, featName: "Expertise: Perception", aptitude: "Expertise" },
    { levelIndex: 0, featName: "Weapon Mastery: Shortsword", aptitude: "Weapon Mastery" },
    { levelIndex: 0, featName: "Weapon Mastery: Dagger", aptitude: "Weapon Mastery" },
    { levelIndex: 2, featName: "Thief", aptitude: "Rogue Subclass" },
  ],
  inventory: [
    { name: "Shortsword", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Leather Armor", quantity: 1, location: "Armor" },
    { name: "Dagger", quantity: 2 },
    { name: "Thieves' Tools", quantity: 1 },
  ],
} satisfies CharacterSeed;
