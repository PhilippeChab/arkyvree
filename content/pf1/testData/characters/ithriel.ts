import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/pf1/fields/index.ts";

/** Every wizard cantrip, which her spellbook holds. */
const CANTRIPS = [
  "Acid Splash",
  "Arcane Mark",
  "Bleed",
  "Dancing Lights",
  "Daze",
  "Detect Magic",
  "Detect Poison",
  "Disrupt Undead",
  "Flare",
  "Ghost Sound",
  "Light",
  "Mage Hand",
  "Mending",
  "Message",
  "Open/Close",
  "Prestidigitation",
  "Ray of Frost",
  "Read Magic",
  "Resistance",
  "Touch of Fatigue",
];

/** The arcane school she specializes in and her two opposition schools. */
const SCHOOL = "Evocation";

/**
 * Elf Wizard 5, an evoker opposing enchantment and necromancy, with a raven familiar for her arcane bond. 15-point buy:
 * Str 8 (-2), Dex 12 (2), Con 14 (5), Int 17 (13), Wis 11 (1), Cha 7 (-4); her race's +2 Dex, +2 Int, -2 Con (Int 19),
 * and her 4th level's increase to Constitution (13), which leaves her skill points as they were. Skills: 2 + Int 4 = 6
 * a level. Feats: general at 1, 3 and 5, Scribe Scroll granted, a wizard's bonus feat at 5. Spellbook: every cantrip, 3
 * 1st-level spells and 2 more a level.
 */
export default {
  name: "Ithriel Moonquill",
  links: { race: "Elf" },
  fields: {
    [CHARACTER_XP]: 15_000,
    [CHARACTER_ALIGNMENT]: "Neutral Good",
    [CHARACTER_AGE]: 142,
    [CHARACTER_GENDER]: "Female",
    [CHARACTER_HEIGHT]: "168",
    [CHARACTER_WEIGHT]: "52",
  },
  description:
    "An elven evoker who left the libraries of her house to study storms first-hand, Ithriel keeps her spellbook bound in oiled sealskin and her raven on her shoulder.",
  abilities: { Strength: 8, Dexterity: 12, Constitution: 14, Intelligence: 17, Wisdom: 11, Charisma: 7 },
  languages: ["Common", "Elven", "Celestial", "Draconic", "Gnome", "Sylvan"],
  classes: [{ klass: "Wizard", hp: [6, 4, 3, 5, 4] }],
  abilityIncreases: [{ levelIndex: 3, abilityName: "Constitution" }],
  skills: [0, 1, 2, 3, 4].flatMap((levelIndex) => [
    { levelIndex, skillName: "Spellcraft", rank: 1 },
    { levelIndex, skillName: "Knowledge (Arcana)", rank: 1 },
    { levelIndex, skillName: "Knowledge (Planes)", rank: 1 },
    { levelIndex, skillName: "Knowledge (History)", rank: 1 },
    { levelIndex, skillName: "Knowledge (Nature)", rank: 1 },
    { levelIndex, skillName: "Fly", rank: 1 },
  ]),
  feats: [
    { levelIndex: 0, featName: `${SCHOOL} Specialist`, aptitude: "Arcane School" },
    { levelIndex: 0, featName: "Opposition School: Enchantment", aptitude: "Opposition School" },
    { levelIndex: 0, featName: "Opposition School: Necromancy", aptitude: "Opposition School" },
    { levelIndex: 0, featName: "Arcane Bond: Familiar", aptitude: "Arcane Bond" },
    { levelIndex: 0, featName: "Raven Familiar", aptitude: "Familiar Bond" },
    { levelIndex: 0, featName: `Spell Focus: ${SCHOOL}`, aptitude: "General" },
    { levelIndex: 2, featName: "Combat Casting", aptitude: "General" },
    { levelIndex: 4, featName: "Improved Initiative", aptitude: "General" },
    { levelIndex: 4, featName: "Extend Spell", aptitude: "Wizard Bonus Feat" },
  ],
  spells: [
    ...CANTRIPS.map((spellName) => ({ levelIndex: 0, spellName, aptitude: "Wizard Spells" })),
    { levelIndex: 0, spellName: "Magic Missile", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Mage Armor", aptitude: "Wizard Spells" },
    { levelIndex: 0, spellName: "Shield", aptitude: "Wizard Spells" },
    { levelIndex: 1, spellName: "Burning Hands", aptitude: "Wizard Spells" },
    { levelIndex: 1, spellName: "Grease", aptitude: "Wizard Spells" },
    { levelIndex: 2, spellName: "Scorching Ray", aptitude: "Wizard Spells" },
    { levelIndex: 2, spellName: "Mirror Image", aptitude: "Wizard Spells" },
    { levelIndex: 3, spellName: "Glitterdust", aptitude: "Wizard Spells" },
    { levelIndex: 3, spellName: "Invisibility", aptitude: "Wizard Spells" },
    { levelIndex: 4, spellName: "Fireball", aptitude: "Wizard Spells" },
    { levelIndex: 4, spellName: "Haste", aptitude: "Wizard Spells" },
  ],
  inventory: [{ name: "Quarterstaff", quantity: 1, location: "Two Handed", groups: [0] }],
} satisfies TestCharacterSeed;
