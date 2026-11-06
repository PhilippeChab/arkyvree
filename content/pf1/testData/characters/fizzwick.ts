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
 * Gnome Sorcerer 4. 15-point buy: Str 8 (-2), Dex 14 (5), Con 13 (3), Int 12 (2), Wis 10 (0), Cha 15 (7); his race's
 * +2 Con, +2 Cha, -2 Str, and his 4th level's increase to Charisma (18). Skills: 2 + Int 1 = 3 a level. Feats: general
 * at 1 and 3, Eschew Materials granted. Spells known: 4 cantrips and two 1st-level spells at 1st level, a cantrip at
 * 2nd, a 1st-level spell at 3rd, a cantrip and a 2nd-level spell at 4th.
 */
export default {
  name: "Fizzwick Pebblebright",
  links: { race: "Gnome" },
  fields: {
    [CHARACTER_XP]: 9_000,
    [CHARACTER_ALIGNMENT]: "Chaotic Good",
    [CHARACTER_AGE]: 58,
    [CHARACTER_GENDER]: "Male",
    [CHARACTER_HEIGHT]: "98",
    [CHARACTER_WEIGHT]: "18",
  },
  description:
    "A gnome whose sneezes once set a hayloft alight, Fizzwick learned to coax the fire in his blood into bright, loud and mostly deliberate spells.",
  abilities: { Strength: 8, Dexterity: 14, Constitution: 13, Intelligence: 12, Wisdom: 10, Charisma: 15 },
  languages: ["Common", "Gnome", "Sylvan", "Draconic"],
  classes: [{ klass: "Sorcerer", hp: [6, 4, 5, 3] }],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Charisma" }],
  skills: [0, 1, 2, 3].flatMap((levelIndex) => [
    { levelIndex, skillName: "Spellcraft", rank: 1 },
    { levelIndex, skillName: "Knowledge (Arcana)", rank: 1 },
    { levelIndex, skillName: "Bluff", rank: 1 },
  ]),
  feats: [
    { levelIndex: 0, featName: "Spell Focus: Evocation", aptitude: "General" },
    { levelIndex: 2, featName: "Combat Casting", aptitude: "General" },
  ],
  spells: [
    { levelIndex: 0, spellName: "Detect Magic", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Light", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Mage Hand", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Prestidigitation", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Magic Missile", aptitude: "Sorcerer Spells" },
    { levelIndex: 0, spellName: "Burning Hands", aptitude: "Sorcerer Spells" },
    { levelIndex: 1, spellName: "Ray of Frost", aptitude: "Sorcerer Spells" },
    { levelIndex: 2, spellName: "Color Spray", aptitude: "Sorcerer Spells" },
    { levelIndex: 3, spellName: "Read Magic", aptitude: "Sorcerer Spells" },
    { levelIndex: 3, spellName: "Scorching Ray", aptitude: "Sorcerer Spells" },
  ],
  inventory: [
    { name: "Light Crossbow", quantity: 1, location: "Two Handed", groups: [0] },
    { name: "Dagger", quantity: 1, location: "Main Hand", groups: [1] },
  ],
} satisfies TestCharacterSeed;
