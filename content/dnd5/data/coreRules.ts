/**
 * The core rules' own rows, as the SRD 5.2.1's tables give them: the abilities (the Ability Descriptions table), a
 * saving throw for each, the skills (the Skills table, each with its ability and an example of its use), and the
 * languages (the Standard Languages and Rare Languages tables).
 */

import type { AbilitySeed } from "@/content/dnd5/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/dnd5/builders/languages/types.ts";
import type { SaveSeed } from "@/content/dnd5/builders/saves/types.ts";
import type { SkillSeed } from "@/content/dnd5/builders/skills/types.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5/abilities.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd5/fields/index.ts";
import {
  RARE_LANGUAGE_TYPE,
  RARE_LANGUAGES,
  STANDARD_LANGUAGE_TYPE,
  STANDARD_LANGUAGES,
} from "@/vocabulary/dnd5/languages.ts";
import { SKILL_ABILITIES, SKILL_NAMES, type SkillName } from "@/vocabulary/dnd5/skills.ts";

/** What each ability measures, as the Ability Descriptions table says. */
const ABILITY_MEASURES: Record<string, string> = {
  Strength: "Physical might",
  Dexterity: "Agility, reflexes, and balance",
  Constitution: "Health and stamina",
  Intelligence: "Reasoning and memory",
  Wisdom: "Perceptiveness and mental fortitude",
  Charisma: "Confidence, poise, and charm",
};

/** What each language is, in our own words: the SRD's tables name them alone. */
const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  Common: "The language every character knows.",
  "Common Sign Language": "A sign language used across the world.",
  Draconic: "The language of dragons and dragonborn.",
  Dwarvish: "The language of dwarves.",
  Elvish: "The language of elves.",
  Giant: "The language of giants and goliaths.",
  Gnomish: "The language of gnomes.",
  Goblin: "The language of goblins, hobgoblins and bugbears.",
  Halfling: "The language of halflings.",
  Orc: "The language of orcs.",
  Abyssal: "The language of demons.",
  Celestial: "The language of angels and other celestials.",
  "Deep Speech": "The language of aberrations from beyond.",
  Druidic: "The secret language of druids.",
  Infernal: "The language of devils.",
  Primordial: "The language of elementals, with its Aquan, Auran, Ignan and Terran dialects.",
  Sylvan: "The language of the fey.",
  "Thieves' Cant": "A secret mix of jargon and signs used by rogues.",
  Undercommon: "The trade language of the Underdark.",
};

/** What each saving throw resists, in our own words. */
const SAVE_DESCRIPTIONS: Record<string, string> = {
  Strength: "Resist being pushed, grabbed or knocked down.",
  Dexterity: "Dodge out of the way of danger.",
  Constitution: "Endure poison, disease and exhaustion.",
  Intelligence: "Resist attacks on your mind and illusions.",
  Wisdom: "Resist charm, fear and mental control.",
  Charisma: "Hold on to yourself against possession and banishment.",
};

/** What each skill is used for, as the Skills table's examples give it. */
// oxfmt-ignore
const SKILL_USES: Record<SkillName, string> = {
  Acrobatics: "Stay on your feet in a tricky situation, or perform an acrobatic stunt.",
  "Animal Handling": "Calm or train an animal, or get an animal to behave in a certain way.",
  Arcana: "Recall lore about spells, magic items, and the planes of existence.",
  Athletics: "Jump farther than normal, stay afloat in rough water, or break something.",
  Deception: "Tell a convincing lie, or wear a disguise convincingly.",
  History: "Recall lore about historical events, people, nations, and cultures.",
  Insight: "Discern a person's mood and intentions.",
  Intimidation: "Awe or threaten someone into doing what you want.",
  Investigation: "Find obscure information in books, or deduce how something works.",
  Medicine: "Diagnose an illness, or determine what killed the recently slain.",
  Nature: "Recall lore about terrain, plants, animals, and weather.",
  Perception: "Using a combination of senses, notice something that's easy to miss.",
  Performance: "Act, tell a story, perform music, or dance.",
  Persuasion: "Honestly and graciously convince someone of something.",
  Religion: "Recall lore about gods, religious rituals, and holy symbols.",
  "Sleight of Hand": "Pick a pocket, conceal a handheld object, or perform legerdemain.",
  Stealth: "Escape notice by moving quietly and hiding behind things.",
  Survival: "Follow tracks, forage, find a trail, or avoid natural hazards.",
};

/** The six abilities, in the SRD's order, each what it measures. */
export const ABILITIES: AbilitySeed[] = ABILITY_NAMES.map((name) => ({ name, description: ABILITY_MEASURES[name] }));

/** The languages: the standard ones a new character picks, then the rare ones a feature grants. */
export const LANGUAGES: LanguageSeed[] = [
  ...STANDARD_LANGUAGES.map((name) => ({
    name,
    description: LANGUAGE_DESCRIPTIONS[name],
    fields: { [LANGUAGE_TYPE]: STANDARD_LANGUAGE_TYPE },
  })),
  ...RARE_LANGUAGES.map((name) => ({
    name,
    description: LANGUAGE_DESCRIPTIONS[name],
    fields: { [LANGUAGE_TYPE]: RARE_LANGUAGE_TYPE },
  })),
];

/** A saving throw for each ability, named as it is, its bonus its ability's. */
export const SAVES: SaveSeed[] = ABILITY_NAMES.map((name) => ({
  name,
  description: SAVE_DESCRIPTIONS[name],
  links: { keyAbility: name },
}));

/** The skills, in the Skills table's order, each with its ability and its example uses. */
export const SKILLS: SkillSeed[] = SKILL_NAMES.map((name) => ({
  name,
  description: SKILL_USES[name],
  links: { keyAbility: SKILL_ABILITIES[name] },
}));
