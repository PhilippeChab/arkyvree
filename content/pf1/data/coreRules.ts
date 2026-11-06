/**
 * The core rules' own rows, which no book's page gives: the abilities, the saves, the skills and the languages
 * (`ContentSeeder`'s `SeedsCoreRules` writes them, but the skills, which Pathfinder's `SeedsSkills` writes).
 */

import type { AbilitySeed } from "@/content/pf1/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/pf1/builders/languages/types.ts";
import type { SaveSeed } from "@/content/pf1/builders/saves/types.ts";
import type { SkillSeed } from "@/content/pf1/builders/skills/types.ts";
import {
  LANGUAGE_TYPE,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/pf1/fields/index.ts";
import { SECRET_LANGUAGE_TYPE } from "@/vocabulary/pf1/languages.ts";
import { SKILL_NAMES, type SkillName } from "@/vocabulary/pf1/skills.ts";

/** A skill armor weighs on, once (a Strength or Dexterity skill, the Core Rulebook's skill summary marks them all). */
const WEIGHED = { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_CHECK_PENALTY_MULTIPLIER]: 1 } as const;
/** A language that's spoken, not secret. */
const SPOKEN = { [LANGUAGE_TYPE]: "Spoken" } as const;
/** A skill used untrained. */
const UNTRAINED = { [SKILL_USABLE_WITHOUT_TRAINING]: true } as const;

/**
 * Each skill's description, key ability and fields, by its name, as the Core Rulebook's skill summary gives them:
 * whether armor weighs on it (once on each, Swim's included) and whether it can be used untrained, each none when not.
 * A Knowledge skill is trained only: an untrained check of DC 10 or lower is the table's to allow.
 */
// oxfmt-ignore
const SKILL_FIELDS: Record<SkillName, Omit<SkillSeed, "name">> = {
  "Acrobatics": { description: "Keep your balance on narrow surfaces, tumble past foes and jump.", links: { keyAbility: "Dexterity" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Appraise": { description: "Determine the value of an item.", links: { keyAbility: "Intelligence" }, fields: UNTRAINED },
  "Bluff": { description: "Make others believe something that isn't true, or feint in combat.", links: { keyAbility: "Charisma" }, fields: UNTRAINED },
  "Climb": { description: "Scale vertical surfaces, from smooth city walls to rocky cliffs.", links: { keyAbility: "Strength" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Craft": { description: "Create items of a particular type, such as armor, weapons, paintings, or traps.", links: { keyAbility: "Intelligence" }, fields: UNTRAINED },
  "Diplomacy": { description: "Change the attitudes of others, or gather information from them.", links: { keyAbility: "Charisma" }, fields: UNTRAINED },
  "Disable Device": { description: "Disarm a trap, open a lock, or sabotage a device.", links: { keyAbility: "Dexterity" }, fields: WEIGHED },
  "Disguise": { description: "Change your appearance or someone else's appearance through makeup, clothing, and behavior.", links: { keyAbility: "Charisma" }, fields: UNTRAINED },
  "Escape Artist": { description: "Slip bonds and escape from grapples.", links: { keyAbility: "Dexterity" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Fly": { description: "Maneuver in the air, with wings or by magic.", links: { keyAbility: "Dexterity" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Handle Animal": { description: "Train and control domesticated animals.", links: { keyAbility: "Charisma" } },
  "Heal": { description: "Treat injuries, diseases, and poisons.", links: { keyAbility: "Wisdom" }, fields: UNTRAINED },
  "Intimidate": { description: "Influence others through threats, or demoralize a foe.", links: { keyAbility: "Charisma" }, fields: UNTRAINED },
  "Knowledge (Arcana)": { description: "Knowledge of ancient mysteries, magic traditions, arcane symbols, and constructs, dragons and magical beasts.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Dungeoneering)": { description: "Knowledge of aberrations, caverns, oozes, and spelunking.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Engineering)": { description: "Knowledge of buildings, aqueducts, bridges, and fortifications.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Geography)": { description: "Knowledge of lands, terrain, climate, and people.", links: { keyAbility: "Intelligence" } },
  "Knowledge (History)": { description: "Knowledge of wars, colonies, migrations, and the founding of cities.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Local)": { description: "Knowledge of legends, personalities, inhabitants, laws, customs, and humanoids.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Nature)": { description: "Knowledge of animals, fey, monstrous humanoids, plants, seasons and cycles, weather, and vermin.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Nobility)": { description: "Knowledge of lineages, heraldry, personalities, and royalty.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Planes)": { description: "Knowledge of the Inner and Outer Planes, the Astral and Ethereal Planes, outsiders, and planar magic.", links: { keyAbility: "Intelligence" } },
  "Knowledge (Religion)": { description: "Knowledge of gods and goddesses, mythic history, ecclesiastic tradition, holy symbols, and undead.", links: { keyAbility: "Intelligence" } },
  "Linguistics": { description: "Decipher writing, create or detect forgeries, and learn languages: one per rank.", links: { keyAbility: "Intelligence" } },
  "Perception": { description: "Notice details, hear noises, and spot hidden creatures and things.", links: { keyAbility: "Wisdom" }, fields: UNTRAINED },
  "Perform": { description: "Entertain an audience through acting, dancing, singing, playing instruments, or other means.", links: { keyAbility: "Charisma" }, fields: UNTRAINED },
  "Profession": { description: "Earn a living in a specific trade or career.", links: { keyAbility: "Wisdom" } },
  "Ride": { description: "Control a mount in difficult situations or in combat.", links: { keyAbility: "Dexterity" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Sense Motive": { description: "Tell when someone is bluffing, or sense hidden messages and enchantments.", links: { keyAbility: "Wisdom" }, fields: UNTRAINED },
  "Sleight of Hand": { description: "Pick pockets, hide small objects on your body, or palm them unseen.", links: { keyAbility: "Dexterity" }, fields: WEIGHED },
  "Spellcraft": { description: "Identify spells as they're cast, and magic items, and craft magic items.", links: { keyAbility: "Intelligence" } },
  "Stealth": { description: "Move unseen and unheard, and hide.", links: { keyAbility: "Dexterity" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Survival": { description: "Track, find your way, and live off the land.", links: { keyAbility: "Wisdom" }, fields: UNTRAINED },
  "Swim": { description: "Swim, dive, and stay afloat in rough water.", links: { keyAbility: "Strength" }, fields: { ...WEIGHED, ...UNTRAINED } },
  "Use Magic Device": { description: "Activate magic items you otherwise couldn't, such as a scroll of a spell not on your list.", links: { keyAbility: "Charisma" } },
};

export const ABILITIES: AbilitySeed[] = [
  { name: "Strength", description: "Measures physical power and carrying capacity" },
  { name: "Dexterity", description: "Measures agility, reflexes, and balance" },
  { name: "Constitution", description: "Measures health, stamina, and vital force" },
  { name: "Intelligence", description: "Measures reasoning and memory" },
  { name: "Wisdom", description: "Measures perception and insight" },
  { name: "Charisma", description: "Measures force of personality and leadership" },
];

/**
 * The languages Linguistics lists, a character's past its race's: each spoken, the Core Rulebook sorting none as common
 * or exotic, but Druidic, the druids', which is secret.
 */
// oxfmt-ignore
export const LANGUAGES: LanguageSeed[] = [
  { name: "Abyssal", fields: SPOKEN, description: "The language of demons and other chaotic evil outsiders." },
  { name: "Aklo", fields: SPOKEN, description: "The language of derros, inhuman or otherworldly monsters, and evil fey." },
  { name: "Aquan", fields: SPOKEN, description: "The language of water-based creatures." },
  { name: "Auran", fields: SPOKEN, description: "The language of air-based creatures." },
  { name: "Celestial", fields: SPOKEN, description: "The language of angels and other good outsiders." },
  { name: "Common", fields: SPOKEN, description: "The language of humans, and the most widely spoken one, used for trade and diplomacy." },
  { name: "Draconic", fields: SPOKEN, description: "The language of dragons and reptilian humanoids." },
  { name: "Druidic", fields: { [LANGUAGE_TYPE]: SECRET_LANGUAGE_TYPE }, description: "The druids' secret language." },
  { name: "Dwarven", fields: SPOKEN, description: "The language of dwarves." },
  { name: "Elven", fields: SPOKEN, description: "The language of elves and half-elves." },
  { name: "Giant", fields: SPOKEN, description: "The language of cyclopes, ettins, giants, and ogres." },
  { name: "Gnoll", fields: SPOKEN, description: "The language of gnolls." },
  { name: "Gnome", fields: SPOKEN, description: "The language of gnomes." },
  { name: "Goblin", fields: SPOKEN, description: "The language of bugbears, goblins, and hobgoblins." },
  { name: "Halfling", fields: SPOKEN, description: "The language of halflings." },
  { name: "Ignan", fields: SPOKEN, description: "The language of fire-based creatures." },
  { name: "Infernal", fields: SPOKEN, description: "The language of devils and other lawful evil outsiders." },
  { name: "Orc", fields: SPOKEN, description: "The language of orcs and half-orcs." },
  { name: "Sylvan", fields: SPOKEN, description: "The language of centaurs, fey creatures, plant creatures, and unicorns." },
  { name: "Terran", fields: SPOKEN, description: "The language of earth-based creatures." },
  { name: "Undercommon", fields: SPOKEN, description: "The language of drow, duergar, morlocks, and svirfneblin." },
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
