import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/pf1/fields/index.ts";

/**
 * Dwarf Cleric 3 of a forge god, whose favored weapon is the warhammer. 15-point buy: Str 14 (5), Dex 12 (2), Con 13
 * (3), Int 10 (0), Wis 15 (7), Cha 8 (-2); his race's +2 Con, +2 Wis, -2 Cha. Skills: 2 + Int 0 = 2 a level. Feats:
 * general at 1 and 3, his deity's favored weapon and his two domains at 1.
 */
export default {
  name: "Durgan Stonehearth",
  links: { race: "Dwarf" },
  fields: {
    [CHARACTER_XP]: 5_000,
    [CHARACTER_ALIGNMENT]: "Lawful Good",
    [CHARACTER_AGE]: 74,
    [CHARACTER_DEITY]: "The Forgefather",
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "132",
    [CHARACTER_WEIGHT]: "88",
  },
  description:
    "A temple smith turned field chaplain, Durgan tends the wounded of his clan's mining expeditions and blesses every hammer stroke with a short, gruff prayer.",
  abilities: { Strength: 14, Dexterity: 12, Constitution: 13, Intelligence: 10, Wisdom: 15, Charisma: 8 },
  languages: ["Common", "Dwarven"],
  classes: [{ klass: "Cleric", hp: [8, 6, 5] }],
  skills: [
    { levelIndex: 0, skillName: "Heal", rank: 1 },
    { levelIndex: 0, skillName: "Knowledge (Religion)", rank: 1 },
    { levelIndex: 1, skillName: "Heal", rank: 1 },
    { levelIndex: 1, skillName: "Sense Motive", rank: 1 },
    { levelIndex: 2, skillName: "Heal", rank: 1 },
    { levelIndex: 2, skillName: "Knowledge (Religion)", rank: 1 },
  ],
  feats: [
    { levelIndex: 0, featName: "Deity's Favored Weapon: Warhammer", aptitude: "Deity's Favored Weapon" },
    { levelIndex: 0, featName: "Earth Domain", aptitude: "Cleric Domain" },
    { levelIndex: 0, featName: "Protection Domain", aptitude: "Cleric Domain" },
    { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 2, featName: "Toughness", aptitude: "General" },
  ],
  inventory: [
    { name: "Warhammer", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Chainmail", quantity: 1, location: "Armor" },
    { name: "Heavy Wooden Shield", quantity: 1, location: "Off Hand", groups: [0] },
  ],
} satisfies TestCharacterSeed;
