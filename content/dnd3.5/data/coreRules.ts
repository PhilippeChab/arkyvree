/**
 * The core rules' own rows, which no book's page gives: the abilities, the saves, the skills and the languages
 * (`ContentSeeder`'s `SeedsCoreRules` writes them, but the skills, which 3.5's `SeedsSkills` writes).
 */

import type { AbilitySeed } from "@/content/dnd3.5/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/dnd3.5/builders/languages/types.ts";
import type { SaveSeed } from "@/content/dnd3.5/builders/saves/types.ts";
import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import {
  LANGUAGE_TYPE,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import { SKILL_NAMES, type SkillName } from "@/vocabulary/dnd3.5/skills.ts";

/**
 * Each skill's description, key ability and fields, by its name: whether armor weighs on it (twice over on Swim:
 * "Double the normal armor check penalty is applied to Swim checks") and whether it can be used untrained, each none
 * when not.
 */
// oxfmt-ignore
const SKILL_FIELDS: Record<SkillName, Omit<SkillSeed, "name">> = {
  "Appraise": { description: "Determine the value of an item.", links: { keyAbility: "Intelligence" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Balance": { description: "Keep your balance while walking on a narrow or treacherous surface.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Bluff": { description: "Convince others that what you are saying is true or make others believe something that isn't true.", links: { keyAbility: "Charisma" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Climb": { description: "Scale vertical surfaces, from smooth city walls to rocky cliffs.", links: { keyAbility: "Strength" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Concentration": { description: "Maintain focus while casting a spell or using a spell-like ability.", links: { keyAbility: "Constitution" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Craft": { description: "Create items of a particular type, such as armor, weapons, paintings, or traps.", links: { keyAbility: "Intelligence" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Decipher Script": { description: "Decipher writing in an unfamiliar language or a message written in an incomplete or archaic form.", links: { keyAbility: "Intelligence" } },
  "Diplomacy": { description: "Change the attitudes of others with your words and actions.", links: { keyAbility: "Charisma" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Disable Device": { description: "Disarm a trap, jam a lock, or rig a wagon wheel to fall off.", links: { keyAbility: "Intelligence" } },
  "Disguise": { description: "Change your appearance or someone else's appearance through makeup, clothing, and behavior.", links: { keyAbility: "Charisma" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Escape Artist": { description: "Slip bonds and escape from grapples.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Forgery": { description: "Create fake documents or modify existing ones.", links: { keyAbility: "Intelligence" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Gather Information": { description: "Collect information about a specific topic or person by spending time with locals.", links: { keyAbility: "Charisma" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Handle Animal": { description: "Train and control domesticated animals.", links: { keyAbility: "Charisma" } },
  "Heal": { description: "Treat injuries, diseases, and poisons.", links: { keyAbility: "Wisdom" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Hide": { description: "Conceal yourself from detection.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Intimidate": { description: "Influence others through threats, hostile actions, and physical violence.", links: { keyAbility: "Charisma" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Jump": { description: "Leap over pits, vault low walls, or reach a tree's lowest branches.", links: { keyAbility: "Strength" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Knowledge (Arcana)": { description: "Knowledge of magic, magical traditions, arcane symbols, and magical theory.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Architecture and Engineering)": { description: "Knowledge of buildings, aqueducts, bridges, and fortifications.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Dungeoneering)": { description: "Knowledge of underground complexes, unusual subterranean creatures, and dungeon hazards.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Geography)": { description: "Knowledge of lands, terrain, climate, and weather.", links: { keyAbility: "Intelligence" } },
  "Knowledge (History)": { description: "Knowledge of historical events, legendary people, ancient kingdoms, and past disputes.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Local)": { description: "Knowledge of local laws, customs, and personalities.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Nature)": { description: "Knowledge of natural terrain, plants and animals, seasons and cycles, and natural resources.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Nobility and Royalty)": { description: "Knowledge of lineages, heraldry, personalities, and customs of nobility.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Psionics)": { description: "Knowledge of psionic powers, psionic races, and the nature of psionic energy.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Religion)": { description: "Knowledge of gods, religious traditions, mythic history, ecclesiastic tradition, and holy symbols.", links: { keyAbility: "Intelligence" } },
  "Knowledge (The Planes)": { description: "Knowledge of the Inner Planes, the Outer Planes, the Astral Plane, and the Ethereal Plane.", links: { keyAbility: "Intelligence" } },
  "Listen": { description: "Hear approaching enemies, detect someone sneaking up on you, or eavesdrop on a conversation.", links: { keyAbility: "Wisdom" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Move Silently": { description: "Move quietly and avoid making noise.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Open Lock": { description: "Open lock using lockpicks.", links: { keyAbility: "Dexterity" } },
  "Perform": { description: "Entertain an audience through acting, dancing, singing, playing instruments, or other means.", links: { keyAbility: "Charisma" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Profession": { description: "Earn a living in a specific trade or career.", links: { keyAbility: "Wisdom" } },
  "Ride": { description: "Control a mount or vehicle in difficult situations.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Search": { description: "Find secret doors, simple traps, hidden compartments, and other details not readily apparent.", links: { keyAbility: "Intelligence" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Sense Motive": { description: "Determine if someone is lying or predict someone's next action.", links: { keyAbility: "Wisdom" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Sleight of Hand": { description: "Perform manual feats of legerdemain, from palming a coin to picking pockets.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true } },
  "Speak Language": { description: "Spend skill points to learn new languages. Each point grants one additional language.", links: { keyAbility: "Intelligence" } },
  "Spellcraft": { description: "Identify spells and magical effects.", links: { keyAbility: "Intelligence" } },
  "Spot": { description: "Notice visual clues and details that might otherwise go unnoticed.", links: { keyAbility: "Wisdom" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Survival": { description: "Follow tracks, hunt wild game, guide a party through the wilderness, identify natural hazards, and predict weather.", links: { keyAbility: "Wisdom" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Swim": { description: "Navigate through water and avoid drowning.", links: { keyAbility: "Strength" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_CHECK_PENALTY_MULTIPLIER]: 2, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
  "Tumble": { description: "Perform acrobatic maneuvers, including somersaults, handstands, and flips.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_IMPACTED_BY_WEIGHT]: true } },
  "Use Magic Device": { description: "Activate magical items that normally you couldn't activate.", links: { keyAbility: "Charisma" } },
  "Use Psionic Device": { description: "Activate psionic items that you otherwise could not activate, such as dorjes, power stones, and psicrowns.", links: { keyAbility: "Charisma" } },
  "Use Rope": { description: "Tie knots, bind prisoners, and handle rope in many different situations.", links: { keyAbility: "Dexterity" }, fields: { [SKILL_USABLE_WITHOUT_TRAINING]: true } },
};

export const ABILITIES: AbilitySeed[] = [
  { name: "Strength", description: "Measures physical power and carrying capacity" },
  { name: "Dexterity", description: "Measures agility, reflexes, and balance" },
  { name: "Constitution", description: "Measures health, stamina, and vital force" },
  { name: "Intelligence", description: "Measures reasoning and memory" },
  { name: "Wisdom", description: "Measures perception and insight" },
  { name: "Charisma", description: "Measures force of personality and leadership" },
];

// oxfmt-ignore
export const LANGUAGES: LanguageSeed[] = [
  { name: "Abyssal", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of demons, full of curses and threats." },
  { name: "Aquan", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of the sea" },
  { name: "Auran", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of the sky" },
  { name: "Celestial", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of angels and other good outsiders, known for its beauty and clarity." },
  { name: "Common", fields: { [LANGUAGE_TYPE]: "Common" }, description: "The most widely spoken language in the world, used for trade and diplomacy." },
  { name: "Draconic", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of dragons, known for its complex grammar and rich vocabulary." },
  { name: "Druidic", fields: { [LANGUAGE_TYPE]: "Secret" }, description: "The language of druids" },
  { name: "Dwarven", fields: { [LANGUAGE_TYPE]: "Common" }, description: "The language of dwarves, known for its complex grammar and rich vocabulary for stone and metal." },
  { name: "Elven", fields: { [LANGUAGE_TYPE]: "Common" }, description: "A flowing, melodic language spoken by elves, known for its beauty and precision." },
  { name: "Giant", fields: { [LANGUAGE_TYPE]: "Common" }, description: "A harsh, guttural language spoken by giants and their kin." },
  { name: "Gnome", fields: { [LANGUAGE_TYPE]: "Common" }, description: "A language full of technical terms and complex concepts, reflecting the gnomes' inventive nature." },
  { name: "Goblin", fields: { [LANGUAGE_TYPE]: "Common" }, description: "A crude language spoken by goblins and related creatures." },
  { name: "Gnoll", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of gnoll" },
  { name: "Halfling", fields: { [LANGUAGE_TYPE]: "Common" }, description: "A simple, practical language spoken by halflings." },
  { name: "Ignan", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of the Ignan" },
  { name: "Infernal", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of devils, known for its complex legal terminology." },
  { name: "Orc", fields: { [LANGUAGE_TYPE]: "Common" }, description: "A brutal, aggressive language spoken by orcs and their kin." },
  { name: "Sylvan", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of fey creatures, known for its musical quality." },
  { name: "Terran", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "The language of the Terran" },
  { name: "Undercommon", fields: { [LANGUAGE_TYPE]: "Exotic" }, description: "A trade language spoken in the Underdark, derived from Elven." },
];

/** The saves, each with the ability it adds (its `keyAbility` link). */
// oxfmt-ignore
export const SAVES: SaveSeed[] = [
  { name: "Fortitude", description: "Represents physical toughness and resistance to physical threats like poison, disease, and fatigue", links: { keyAbility: "Constitution" } },
  { name: "Reflex", description: "Represents agility and the ability to dodge area attacks like fireballs and dragon breath", links: { keyAbility: "Dexterity" } },
  { name: "Will", description: "Represents mental resilience and resistance to mind-affecting spells and effects", links: { keyAbility: "Wisdom" } },
];

/** The skills, one for each of the vocabulary's, in its order. */
export const SKILLS: SkillSeed[] = SKILL_NAMES.map((name) => ({ name, ...SKILL_FIELDS[name] }));
