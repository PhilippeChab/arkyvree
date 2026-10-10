/**
 * The core rules' own rows, which no book's page gives: the abilities, the saves, the skills and the languages
 * (`ContentSeeder`'s `SeedsCoreRules` writes them, but the skills, which 3.5's `SeedsSkills` writes).
 */

import type { AbilitySeed } from "@/content/core/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/core/builders/languages/types.ts";
import type { SaveSeed } from "@/content/core/builders/saves/types.ts";
import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import { SKILL_NAMES, type SkillName } from "@/vocabulary/dnd3.5/skills.ts";

/**
 * Each skill's fields, by its name: its key ability, whether armor weighs on it (twice over on Swim: "Double the normal
 * armor check penalty is applied to Swim checks") and whether it can be used untrained.
 */
// oxfmt-ignore
const SKILL_FIELDS: Record<SkillName, Omit<SkillSeed, "name">> = {
  "Appraise": { description: "Determine the value of an item.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  "Balance": { description: "Keep your balance while walking on a narrow or treacherous surface.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  "Bluff": { description: "Convince others that what you are saying is true or make others believe something that isn't true.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  "Climb": { description: "Scale vertical surfaces, from smooth city walls to rocky cliffs.", ability: "Strength", impactedByWeight: true, usableWithoutTraining: true },
  "Concentration": { description: "Maintain focus while casting a spell or using a spell-like ability.", ability: "Constitution", impactedByWeight: false, usableWithoutTraining: true },
  "Craft": { description: "Create items of a particular type, such as armor, weapons, paintings, or traps.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  "Decipher Script": { description: "Decipher writing in an unfamiliar language or a message written in an incomplete or archaic form.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Diplomacy": { description: "Change the attitudes of others with your words and actions.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  "Disable Device": { description: "Disarm a trap, jam a lock, or rig a wagon wheel to fall off.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Disguise": { description: "Change your appearance or someone else's appearance through makeup, clothing, and behavior.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  "Escape Artist": { description: "Slip bonds and escape from grapples.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  "Forgery": { description: "Create fake documents or modify existing ones.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  "Gather Information": { description: "Collect information about a specific topic or person by spending time with locals.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  "Handle Animal": { description: "Train and control domesticated animals.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: false },
  "Heal": { description: "Treat injuries, diseases, and poisons.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  "Hide": { description: "Conceal yourself from detection.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  "Intimidate": { description: "Influence others through threats, hostile actions, and physical violence.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  "Jump": { description: "Leap over pits, vault low walls, or reach a tree's lowest branches.", ability: "Strength", impactedByWeight: true, usableWithoutTraining: true },
  "Knowledge (Arcana)": { description: "Knowledge of magic, magical traditions, arcane symbols, and magical theory.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Architecture and Engineering)": { description: "Knowledge of buildings, aqueducts, bridges, and fortifications.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Dungeoneering)": { description: "Knowledge of underground complexes, unusual subterranean creatures, and dungeon hazards.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Geography)": { description: "Knowledge of lands, terrain, climate, and weather.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (History)": { description: "Knowledge of historical events, legendary people, ancient kingdoms, and past disputes.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Local)": { description: "Knowledge of local laws, customs, and personalities.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Nature)": { description: "Knowledge of natural terrain, plants and animals, seasons and cycles, and natural resources.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Nobility and Royalty)": { description: "Knowledge of lineages, heraldry, personalities, and customs of nobility.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Psionics)": { description: "Knowledge of psionic powers, psionic races, and the nature of psionic energy.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (Religion)": { description: "Knowledge of gods, religious traditions, mythic history, ecclesiastic tradition, and holy symbols.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Knowledge (The Planes)": { description: "Knowledge of the Inner Planes, the Outer Planes, the Astral Plane, and the Ethereal Plane.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Listen": { description: "Hear approaching enemies, detect someone sneaking up on you, or eavesdrop on a conversation.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  "Move Silently": { description: "Move quietly and avoid making noise.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  "Open Lock": { description: "Open lock using lockpicks.", ability: "Dexterity", impactedByWeight: false, usableWithoutTraining: false },
  "Perform": { description: "Entertain an audience through acting, dancing, singing, playing instruments, or other means.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  "Profession": { description: "Earn a living in a specific trade or career.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: false },
  "Ride": { description: "Control a mount or vehicle in difficult situations.", ability: "Dexterity", impactedByWeight: false, usableWithoutTraining: true },
  "Search": { description: "Find secret doors, simple traps, hidden compartments, and other details not readily apparent.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  "Sense Motive": { description: "Determine if someone is lying or predict someone's next action.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  "Sleight of Hand": { description: "Perform manual feats of legerdemain, from palming a coin to picking pockets.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: false },
  "Speak Language": { description: "Spend skill points to learn new languages. Each point grants one additional language.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Spellcraft": { description: "Identify spells and magical effects.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  "Spot": { description: "Notice visual clues and details that might otherwise go unnoticed.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  "Survival": { description: "Follow tracks, hunt wild game, guide a party through the wilderness, identify natural hazards, and predict weather.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  "Swim": { description: "Navigate through water and avoid drowning.", ability: "Strength", impactedByWeight: true, checkPenaltyMultiplier: 2, usableWithoutTraining: true },
  "Tumble": { description: "Perform acrobatic maneuvers, including somersaults, handstands, and flips.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: false },
  "Use Magic Device": { description: "Activate magical items that normally you couldn't activate.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: false },
  "Use Psionic Device": { description: "Activate psionic items that you otherwise could not activate, such as dorjes, power stones, and psicrowns.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: false },
  "Use Rope": { description: "Tie knots, bind prisoners, and handle rope in many different situations.", ability: "Dexterity", impactedByWeight: false, usableWithoutTraining: true },
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
  { name: "Abyssal", type: "Exotic", description: "The language of demons, full of curses and threats." },
  { name: "Aquan", type: "Exotic", description: "The language of the sea" },
  { name: "Auran", type: "Exotic", description: "The language of the sky" },
  { name: "Celestial", type: "Exotic", description: "The language of angels and other good outsiders, known for its beauty and clarity." },
  { name: "Common", type: "Common", description: "The most widely spoken language in the world, used for trade and diplomacy." },
  { name: "Draconic", type: "Exotic", description: "The language of dragons, known for its complex grammar and rich vocabulary." },
  { name: "Druidic", type: "Exotic", description: "The language of druids" },
  { name: "Dwarven", type: "Common", description: "The language of dwarves, known for its complex grammar and rich vocabulary for stone and metal." },
  { name: "Elven", type: "Common", description: "A flowing, melodic language spoken by elves, known for its beauty and precision." },
  { name: "Giant", type: "Common", description: "A harsh, guttural language spoken by giants and their kin." },
  { name: "Gnome", type: "Common", description: "A language full of technical terms and complex concepts, reflecting the gnomes' inventive nature." },
  { name: "Goblin", type: "Common", description: "A crude language spoken by goblins and related creatures." },
  { name: "Gnoll", type: "Exotic", description: "The language of gnoll" },
  { name: "Halfling", type: "Common", description: "A simple, practical language spoken by halflings." },
  { name: "Ignan", type: "Exotic", description: "The language of the Ignan" },
  { name: "Infernal", type: "Exotic", description: "The language of devils, known for its complex legal terminology." },
  { name: "Orc", type: "Common", description: "A brutal, aggressive language spoken by orcs and their kin." },
  { name: "Sylvan", type: "Exotic", description: "The language of fey creatures, known for its musical quality." },
  { name: "Terran", type: "Exotic", description: "The language of the Terran" },
  { name: "Undercommon", type: "Exotic", description: "A trade language spoken in the Underdark, derived from Elven." },
];

/** The saves, each with the ability it adds. */
// oxfmt-ignore
export const SAVES: SaveSeed[] = [
  { name: "Fortitude", description: "Represents physical toughness and resistance to physical threats like poison, disease, and fatigue", ability: "Constitution" },
  { name: "Reflex", description: "Represents agility and the ability to dodge area attacks like fireballs and dragon breath", ability: "Dexterity" },
  { name: "Will", description: "Represents mental resilience and resistance to mind-affecting spells and effects", ability: "Wisdom" },
];

/** The skills, one for each of the vocabulary's, in its order. */
export const SKILLS: SkillSeed[] = SKILL_NAMES.map((name) => ({ name, ...SKILL_FIELDS[name] }));
