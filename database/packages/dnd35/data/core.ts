/**
 * The core rules' content: the ruleset, its hand-written abilities, saves, skills and languages, and all it's seeded
 * with (`CORE`).
 */

import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/srd/aptitudes.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/srd/domains/data.ts";
import { ALL_FEATS } from "@/database/packages/dnd35-from-parser/generated/srd/feats/index.ts";
import {
  GOODS,
  MAGIC_ARMOR,
  MAGIC_SHIELDS,
  MAGIC_WEAPONS,
  RINGS,
  RODS,
  STAFFS,
  WONDROUS_ITEMS,
} from "@/database/packages/dnd35-from-parser/generated/srd/items/index.ts";
import { ALL_RACES } from "@/database/packages/dnd35-from-parser/generated/srd/races/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/srd/spells/index.ts";
import { WIZARD_SCHOOLS } from "@/database/packages/dnd35-from-parser/generated/srd/wizard-schools/data.ts";
import type { AbilityDefinition } from "@/database/packages/dnd35/content/abilities/types.ts";
import type { LanguageDefinition } from "@/database/packages/dnd35/content/languages/types.ts";
import type { CoreContent } from "@/database/packages/dnd35/content/rulesets/types.ts";
import type { SaveDefinition } from "@/database/packages/dnd35/content/saves/types.ts";
import type { SkillDefinition } from "@/database/packages/dnd35/content/skills/types.ts";
import { ANIMAL_COMPANIONS } from "@/database/packages/dnd35/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/database/packages/dnd35/data/bonds/familiars.ts";
import { SPECIAL_MOUNTS } from "@/database/packages/dnd35/data/bonds/mounts.ts";
import { TEMPLATE_ITEMS } from "@/database/packages/dnd35/data/templateItems.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export const ABILITIES: AbilityDefinition[] = [
  { name: "Strength", description: "Measures physical power and carrying capacity" },
  { name: "Dexterity", description: "Measures agility, reflexes, and balance" },
  { name: "Constitution", description: "Measures health, stamina, and vital force" },
  { name: "Intelligence", description: "Measures reasoning and memory" },
  { name: "Wisdom", description: "Measures perception and insight" },
  { name: "Charisma", description: "Measures force of personality and leadership" },
];

// oxfmt-ignore
export const LANGUAGES: LanguageDefinition[] = [
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
export const SAVES: SaveDefinition[] = [
  { name: "Fortitude", description: "Represents physical toughness and resistance to physical threats like poison, disease, and fatigue", ability: "Constitution" },
  { name: "Reflex", description: "Represents agility and the ability to dodge area attacks like fireballs and dragon breath", ability: "Dexterity" },
  { name: "Will", description: "Represents mental resilience and resistance to mind-affecting spells and effects", ability: "Wisdom" },
];

/**
 * The skills, each with its key ability, whether armor weighs on it (twice over on Swim: "Double the normal armor check
 * penalty is applied to Swim checks") and whether it can be used untrained.
 */
// oxfmt-ignore
export const SKILLS: SkillDefinition[] = [
  { name: "Appraise", description: "Determine the value of an item.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Balance", description: "Keep your balance while walking on a narrow or treacherous surface.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  { name: "Bluff", description: "Convince others that what you are saying is true or make others believe something that isn't true.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Climb", description: "Scale vertical surfaces, from smooth city walls to rocky cliffs.", ability: "Strength", impactedByWeight: true, usableWithoutTraining: true },
  { name: "Concentration", description: "Maintain focus while casting a spell or using a spell-like ability.", ability: "Constitution", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Craft", description: "Create items of a particular type, such as armor, weapons, paintings, or traps.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Decipher Script", description: "Decipher writing in an unfamiliar language or a message written in an incomplete or archaic form.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Diplomacy", description: "Change the attitudes of others with your words and actions.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Disable Device", description: "Disarm a trap, jam a lock, or rig a wagon wheel to fall off.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Disguise", description: "Change your appearance or someone else's appearance through makeup, clothing, and behavior.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Escape Artist", description: "Slip bonds and escape from grapples.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  { name: "Forgery", description: "Create fake documents or modify existing ones.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Gather Information", description: "Collect information about a specific topic or person by spending time with locals.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Handle Animal", description: "Train and control domesticated animals.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Heal", description: "Treat injuries, diseases, and poisons.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Hide", description: "Conceal yourself from detection.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  { name: "Intimidate", description: "Influence others through threats, hostile actions, and physical violence.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Jump", description: "Leap over pits, vault low walls, or reach a tree's lowest branches.", ability: "Strength", impactedByWeight: true, usableWithoutTraining: true },
  { name: "Knowledge (Arcana)", description: "Knowledge of magic, magical traditions, arcane symbols, and magical theory.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Architecture and Engineering)", description: "Knowledge of buildings, aqueducts, bridges, and fortifications.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Dungeoneering)", description: "Knowledge of underground complexes, unusual subterranean creatures, and dungeon hazards.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Geography)", description: "Knowledge of lands, terrain, climate, and weather.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (History)", description: "Knowledge of historical events, legendary people, ancient kingdoms, and past disputes.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Local)", description: "Knowledge of local laws, customs, and personalities.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Nature)", description: "Knowledge of natural terrain, plants and animals, seasons and cycles, and natural resources.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Nobility and Royalty)", description: "Knowledge of lineages, heraldry, personalities, and customs of nobility.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Psionics)", description: "Knowledge of psionic powers, psionic races, and the nature of psionic energy.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (Religion)", description: "Knowledge of gods, religious traditions, mythic history, ecclesiastic tradition, and holy symbols.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Knowledge (The Planes)", description: "Knowledge of the Inner Planes, the Outer Planes, the Astral Plane, and the Ethereal Plane.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Listen", description: "Hear approaching enemies, detect someone sneaking up on you, or eavesdrop on a conversation.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Move Silently", description: "Move quietly and avoid making noise.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: true },
  { name: "Open Lock", description: "Open lock using lockpicks.", ability: "Dexterity", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Perform", description: "Entertain an audience through acting, dancing, singing, playing instruments, or other means.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Profession", description: "Earn a living in a specific trade or career.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Ride", description: "Control a mount or vehicle in difficult situations.", ability: "Dexterity", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Search", description: "Find secret doors, simple traps, hidden compartments, and other details not readily apparent.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Sense Motive", description: "Determine if someone is lying or predict someone's next action.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Sleight of Hand", description: "Perform manual feats of legerdemain, from palming a coin to picking pockets.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: false },
  { name: "Speak Language", description: "Spend skill points to learn new languages. Each point grants one additional language.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Spellcraft", description: "Identify spells and magical effects.", ability: "Intelligence", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Spot", description: "Notice visual clues and details that might otherwise go unnoticed.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Survival", description: "Follow tracks, hunt wild game, guide a party through the wilderness, identify natural hazards, and predict weather.", ability: "Wisdom", impactedByWeight: false, usableWithoutTraining: true },
  { name: "Swim", description: "Navigate through water and avoid drowning.", ability: "Strength", impactedByWeight: true, checkPenaltyMultiplier: 2, usableWithoutTraining: true },
  { name: "Tumble", description: "Perform acrobatic maneuvers, including somersaults, handstands, and flips.", ability: "Dexterity", impactedByWeight: true, usableWithoutTraining: false },
  { name: "Use Magic Device", description: "Activate magical items that normally you couldn't activate.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Use Psionic Device", description: "Activate psionic items that you otherwise could not activate, such as dorjes, power stones, and psicrowns.", ability: "Charisma", impactedByWeight: false, usableWithoutTraining: false },
  { name: "Use Rope", description: "Tie knots, bind prisoners, and handle rope in many different situations.", ability: "Dexterity", impactedByWeight: false, usableWithoutTraining: true },
];

/** All the core rules are seeded with, its items the SRD's goods and magic items. */
export const CORE: CoreContent = {
  aptitudes: ALL_APTITUDES,
  languages: LANGUAGES,
  races: ALL_RACES,
  abilities: ABILITIES,
  skills: SKILLS,
  saves: SAVES,
  feats: ALL_FEATS,
  classes: ALL_CLASSES,
  templateItems: TEMPLATE_ITEMS,
  items: [
    ...GOODS,
    ...MAGIC_ARMOR,
    ...MAGIC_SHIELDS,
    ...MAGIC_WEAPONS,
    ...WONDROUS_ITEMS,
    ...RINGS,
    ...RODS,
    ...STAFFS,
  ],
  spells: ALL_SPELLS,
  wizardSchools: WIZARD_SCHOOLS,
  domains: ALL_DOMAINS,
  bonds: [FAMILIARS, ANIMAL_COMPANIONS, SPECIAL_MOUNTS],
};

export const CORE_RULESET = {
  name: DND35_RULESET_NAME,
  description:
    "The 3.5 System Reference Document is a role-playing game system that allows players to create and control characters in a fantasy world.",
};
