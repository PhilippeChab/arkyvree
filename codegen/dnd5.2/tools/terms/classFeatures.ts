/**
 * What the class features give past their text: the pools a feature gives room in at each level it's gained at, the
 * counts a class's levels hold (`class_specific`) that give room or a bonus as they grow, the spell levels a feature
 * gives rooms at, and the modifiers of the features a sheet reads a number of (an Unarmored Defense's Armor Class, an
 * Extra Attack's attacks, a Jack of All Trades' half proficiency…). A feature none names is its text alone.
 */

import { bonus, setFlag } from "@/content/core/builders/customization/modifiers.ts";
import { eqStr } from "@/content/core/builders/customization/requirements.ts";
import type {
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
} from "@/content/core/builders/customization/types.ts";
import { WEAPON_MASTERY_POOL } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import { grantFeat } from "@/content/dnd5.2/builders/feats/possession.ts";
import { savingThrowProficiency } from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import { grantLanguage } from "@/content/dnd5.2/builders/languages/knowledge.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";
import { SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd5.2/skills.ts";

/** A count a class's levels hold that adds to a target as it grows: each increase is a class level's modifier. */
interface ClassCount {
  /** Its key in a level's `class_specific`. */
  key: string;
  requirements?: RequirementEntry[];
  target: string;
}

/** A feature's modifiers, by its name: its class's or its subclass's alone when it names one (`owner`). */
interface FeatureModifiers {
  feature: string;
  modifiers: ModifierSeed[];
  owner?: string;
}

/** No Shield held: what a monk's Unarmored Defense and Unarmored Movement require too. */
const NO_SHIELD: RequirementCondition = {
  target: "combat.shield.held",
  operator: "equal",
  value: "false",
  valueType: "boolean",
};

/** No heavy armor worn: what a barbarian's Fast Movement requires. */
const NOT_HEAVY: RequirementCondition = {
  target: "combat.armor.category",
  operator: "not_equal",
  value: "heavy",
  valueType: "string",
};

/** No armor worn: what an Unarmored Defense's and an Unarmored Movement's bonus requires. */
const UNARMORED = eqStr("combat.armor.category", "none");

/**
 * The counts a class's levels hold that give room or a bonus as they grow, each increase at its level: the kinds of
 * weapons a Weapon Mastery takes (a barbarian's, a fighter's), a monk's Unarmored Movement.
 */
export const CLASS_COUNTS: ClassCount[] = [
  { key: "weapon_mastery", target: `aptitudes.${stripSeparators(WEAPON_MASTERY_POOL)}.allowed` },
  { key: "unarmored_movement_bonus", target: "combat.speed.misc", requirements: [UNARMORED, NO_SHIELD] },
];

/** The modifiers of the features a sheet reads a number of, or that grant a feat or a language, by feature. */
export const FEATURE_MODIFIERS: FeatureModifiers[] = [
  { feature: "Additional Fighting Style", modifiers: [poolRoom("Fighting Style", 1)] },
  {
    feature: "Aura of Protection",
    modifiers: [bonus("saves.*.misc", "{{ max(1, [abilities.charisma.modifier]) }}")],
  },
  {
    feature: "Body and Mind",
    modifiers: [bonus("abilities.dexterity.misc", 4), bonus("abilities.wisdom.misc", 4)],
  },
  {
    feature: "Bonus Proficiencies",
    owner: "College of Lore",
    modifiers: [poolRoom(SKILL_PROFICIENCIES_POOL, 3)],
  },
  {
    feature: "Disciplined Survivor",
    modifiers: ABILITY_NAMES.map((ability) => grantFeat(savingThrowProficiency(ability))),
  },
  {
    feature: "Draconic Resilience",
    modifiers: [
      bonus("combat.hp.misc", "{{ [classes.sorcerer.level] }}"),
      { ...bonus("combat.ac.misc", "{{ [abilities.charisma.modifier] }}"), requirements: [UNARMORED] },
    ],
  },
  { feature: "Deft Explorer", modifiers: [bonus("languages.extrapicks", 2)] },
  { feature: "Druidic", modifiers: [grantLanguage("Druidic")] },
  { feature: "Extra Attack", modifiers: [bonus("combat.attacks", 1)] },
  { feature: "Fast Movement", modifiers: [{ ...bonus("combat.speed.misc", 10), requirements: [NOT_HEAVY] }] },
  { feature: "Improved Critical", modifiers: [bonus("combat.critical.range", 1)] },
  {
    feature: "Jack of All Trades",
    modifiers: SKILL_NAMES.map((skill) => setFlag(`skills.${stripSeparators(skill)}.halfproficient`)),
  },
  {
    feature: "Primal Champion",
    modifiers: [bonus("abilities.strength.misc", 4), bonus("abilities.constitution.misc", 4)],
  },
  {
    feature: "Slippery Mind",
    modifiers: [grantFeat(savingThrowProficiency("Wisdom")), grantFeat(savingThrowProficiency("Charisma"))],
  },
  { feature: "Superior Critical", modifiers: [bonus("combat.critical.range", 1)] },
  { feature: "Thieves' Cant", modifiers: [grantLanguage("Thieves' Cant")] },
  { feature: "Three Extra Attacks", modifiers: [bonus("combat.attacks", 1)] },
  { feature: "Two Extra Attacks", modifiers: [bonus("combat.attacks", 1)] },
  {
    feature: "Unarmored Defense",
    owner: "Barbarian",
    modifiers: [{ ...bonus("combat.ac.misc", "{{ [abilities.constitution.modifier] }}"), requirements: [UNARMORED] }],
  },
  {
    feature: "Unarmored Defense",
    owner: "Monk",
    modifiers: [
      { ...bonus("combat.ac.misc", "{{ [abilities.wisdom.modifier] }}"), requirements: [UNARMORED, NO_SHIELD] },
    ],
  },
];

/** The pool a feature gives a room in at each level it's gained at, by feature. */
export const FEATURE_POOLS: { feature: string; pool: string }[] = [
  { feature: "Ability Score Improvement", pool: "General" },
  { feature: "Epic Boon", pool: "Epic Boon" },
  { feature: "Fighting Style", pool: "Fighting Style" },
];

/**
 * The features that give a spell room past a class's prepared spells, one at each level they're gained at, from a
 * spell level up: a warlock's Mystic Arcanum, a level 6 spell at 11, a level 7 one at 13, and so on.
 */
export const SPELL_ROOM_FEATURES: { feature: string; firstLevel: number }[] = [
  { feature: "Mystic Arcanum", firstLevel: 6 },
];
