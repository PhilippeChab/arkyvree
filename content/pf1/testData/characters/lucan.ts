import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/pf1/fields/index.ts";

/**
 * Human Fighter 6 / Duelist 1, who meets the duelist's requirements at 7th level: base attack +6, 2 ranks in Acrobatics
 * and in Perform, Dodge, Mobility and Weapon Finesse. 15-point buy: Str 13 (3), Dex 15 (7), Con 13 (3), Int 12 (2), Wis
 * 12 (2), Cha 8 (-2); his race's +2 to Dexterity, and his 4th level's increase to Dexterity (18). Skills: a fighter's 2 +
 * Int 1 + human 1 = 4 a level, a duelist's 4 + 1 + 1 = 6. Feats: general at 1, 3, 5 and 7, a human's at 1, a fighter's
 * bonus feat at 1, 2, 4 and 6.
 */
export default {
  name: "Lucan Verrault",
  links: { race: "Human" },
  fields: {
    [CHARACTER_XP]: 35_000,
    [CHARACTER_ALIGNMENT]: "Chaotic Neutral",
    [CHARACTER_AGE]: 29,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "180",
    [CHARACTER_WEIGHT]: "72",
  },
  description:
    "A fencing master's son who traded the salle for the tavern stage and the duelling ground, Lucan fights with a rapier, a smile and a running commentary.",
  abilities: { Strength: 13, Dexterity: 15, Constitution: 13, Intelligence: 12, Wisdom: 12, Charisma: 8 },
  languages: ["Common", "Elven"],
  classes: [
    { klass: "Fighter", hp: [10, 6, 8, 7, 9, 5] },
    { klass: "Duelist", hp: [7] },
  ],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Dexterity" }],
  skills: [
    ...[0, 1].flatMap((levelIndex) =>
      ["Acrobatics", "Perform", "Climb", "Intimidate"].map((skillName) => ({ levelIndex, skillName, rank: 1 })),
    ),
    ...[2, 3, 4, 5].flatMap((levelIndex) =>
      ["Acrobatics", "Climb", "Intimidate", "Swim"].map((skillName) => ({ levelIndex, skillName, rank: 1 })),
    ),
    ...["Acrobatics", "Perform", "Perception", "Sense Motive", "Bluff", "Escape Artist"].map((skillName) => ({
      levelIndex: 6,
      skillName,
      rank: 1,
    })),
  ],
  feats: [
    { levelIndex: 0, featName: "Racial Ability Score: Dexterity", aptitude: "Racial Ability Score" },
    { levelIndex: 0, featName: "Weapon Finesse", aptitude: "General" },
    { levelIndex: 0, featName: "Dodge", aptitude: "General" },
    { levelIndex: 0, featName: "Weapon Focus: Rapier", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 1, featName: "Mobility", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 2, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 3, featName: "Weapon Specialization: Rapier", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 4, featName: "Toughness", aptitude: "General" },
    { levelIndex: 5, featName: "Spring Attack", aptitude: "Fighter Bonus Feat" },
    { levelIndex: 6, featName: "Lunge", aptitude: "General" },
  ],
  inventory: [
    { name: "Rapier", quantity: 1, location: "Main Hand", groups: [0] },
    { name: "Studded Leather", quantity: 1, location: "Armor" },
  ],
} satisfies TestCharacterSeed;
