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
 * Human Soldier Fighter 5 (Champion). Standard array: Str 15, Dex 13, Con 14, Int 8, Wis 12, Cha 10; his background's
 * +2 Strength and +1 Constitution, and his 4th level's Ability Score Improvement's +1 to each (Str 18, Con 16). His
 * background grants Savage Attacker, Athletics and Intimidation, and a gaming set; a human's Skillful takes Perception
 * and Versatile an Origin feat, Alert. His Fighting Style is Defense, and he masters four weapons.
 */
export default {
  name: "Brannoc Ironvale",
  links: { species: "Human", background: "Soldier" },
  fields: {
    [CHARACTER_XP]: 6500,
    [CHARACTER_ALIGNMENT]: "Lawful Neutral",
    [CHARACTER_AGE]: 31,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "183",
    [CHARACTER_WEIGHT]: "88",
  },
  description:
    "A veteran of the border wars, Brannoc holds the line behind a battered shield and a longsword he has kept since his first muster.",
  abilities: { Strength: 15, Dexterity: 13, Constitution: 14, Intelligence: 8, Wisdom: 12, Charisma: 10 },
  languages: ["Dwarvish", "Orc"],
  classes: [{ klass: "Fighter", hp: [10, 6, 8, 5, 7] }],
  feats: [
    { levelIndex: 0, featName: "Soldier: Strength +2, Constitution +1", aptitude: "Soldier Ability Scores" },
    { levelIndex: 0, featName: "Tool Proficiency: Dice", aptitude: "Soldier Tools" },
    { levelIndex: 0, featName: "Skill Proficiency: Perception", aptitude: "Skill Proficiencies" },
    { levelIndex: 0, featName: "Alert", aptitude: "Origin" },
    { levelIndex: 0, featName: "Skill Proficiency: Insight", aptitude: "Fighter Skills" },
    { levelIndex: 0, featName: "Skill Proficiency: Survival", aptitude: "Fighter Skills" },
    { levelIndex: 0, featName: "Defense", aptitude: "Fighting Style" },
    { levelIndex: 0, featName: "Weapon Mastery: Longsword", aptitude: "Weapon Mastery" },
    { levelIndex: 0, featName: "Weapon Mastery: Greatsword", aptitude: "Weapon Mastery" },
    { levelIndex: 0, featName: "Weapon Mastery: Javelin", aptitude: "Weapon Mastery" },
    { levelIndex: 2, featName: "Champion", aptitude: "Fighter Subclass" },
    {
      levelIndex: 3,
      featName: "Ability Score Improvement (Strength +1, Constitution +1)",
      aptitude: "Ability Score Improvement",
    },
    { levelIndex: 3, featName: "Weapon Mastery: Warhammer", aptitude: "Weapon Mastery" },
  ],
  inventory: [
    { name: "Longsword", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Chain Mail", quantity: 1, location: "Armor" },
    { name: "Shield", quantity: 1, location: "Off Hand", groups: [0] },
    { name: "Javelin", quantity: 4 },
  ],
} satisfies CharacterSeed;
