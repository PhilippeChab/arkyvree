/**
 * What the class features give past their text: the pools a feature gives room in at each level it's gained at, the
 * counts a class's levels hold (`class_specific`) that give room or a bonus as they grow, the spell levels a feature
 * gives rooms at, and the modifiers of the features a sheet reads a number of (an Unarmored Defense's Armor Class, an
 * Extra Attack's attacks, a Jack of All Trades' half proficiency…). A feature none names is its text alone.
 */

import { bonus, setFlag, setNum } from "@/content/core/builders/customization/modifiers.ts";
import { eqStr } from "@/content/core/builders/customization/requirements.ts";
import type {
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
} from "@/content/core/builders/customization/types.ts";
import {
  classFightingStyle,
  classSkills,
  DIVINE_ORDER_POOL,
  mysticArcanum,
  PRIMAL_ORDER_POOL,
  WEAPON_MASTERY_POOL,
} from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import { grantFeat } from "@/content/dnd5.2/builders/feats/possession.ts";
import { savingThrowProficiency } from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import { grantLanguage, languagePick } from "@/content/dnd5.2/builders/languages/knowledge.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";
import { FIGHTING_STYLE_OPTION_CLASSES } from "@/vocabulary/dnd5.2/classes.ts";
import { ABILITY_SCORE_IMPROVEMENT_POOL, SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { UNARMED_STRIKE, WEAPON_DEFINITIONS } from "@/vocabulary/dnd5.2/weapons.ts";

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

/**
 * The Monk weapons, as Martial Arts names them, and the Unarmed Strike: Simple Melee weapons and Martial Melee weapons
 * that have the Light property, by name.
 */
const MONK_WEAPONS = [
  UNARMED_STRIKE.name,
  ...Object.entries(WEAPON_DEFINITIONS).flatMap(([name, weapon]) =>
    weapon && !weapon.ranged && (weapon.category === "Simple" || weapon.properties.includes("Light")) ? [name] : [],
  ),
];

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
 * weapons a Weapon Mastery takes (a barbarian's, a fighter's), a monk's Unarmored Movement, and its Martial Arts die's
 * sides on each Monk weapon (6 at its 1st level, 2 more at its 5th, 11th and 17th: d8, d10, d12), which the weapon
 * rolls when better than its own, while its monk wears no armor and holds no Shield.
 */
export const CLASS_COUNTS: ClassCount[] = [
  { key: "weapon_mastery", target: `aptitudes.${stripSeparators(WEAPON_MASTERY_POOL)}.allowed` },
  { key: "unarmored_movement_bonus", target: "combat.speed.misc", requirements: [UNARMORED, NO_SHIELD] },
  ...MONK_WEAPONS.map((weapon) => ({
    key: "martial_arts_die",
    target: `items.weapons.${stripSeparators(weapon)}.damage.die`,
    requirements: [UNARMORED, NO_SHIELD],
  })),
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
    modifiers: [bonus("combat.hp.misc", "{{ [classes.sorcerer.level] }}"), setFlag("combat.ac.unarmored.charisma")],
  },
  { feature: "Deft Explorer", modifiers: [bonus("languages.extrapicks", 2)] },
  { feature: "Druidic", modifiers: [grantLanguage("Druidic")] },
  // Each Extra Attack sets the attacks it gives, which two classes' don't add up to: the fighter's later ones set more,
  // and the sheet keeps the most any sets, whatever the order its levels were taken in
  { feature: "Extra Attack", modifiers: [setNum("combat.attacks", 2)] },
  { feature: "Fast Movement", modifiers: [{ ...bonus("combat.speed.misc", 10), requirements: [NOT_HEAVY] }] },
  { feature: "Improved Critical", modifiers: [bonus("combat.critical.range", 1)] },
  {
    // Every skill, a skill a ruleset adds included
    feature: "Jack of All Trades",
    modifiers: [setFlag("skills.*.halfproficient")],
  },
  {
    // Its weapons attack with Dexterity as a Finesse weapon does, while its monk wears no armor and holds no Shield;
    // its die is its levels' (`CLASS_COUNTS`)
    feature: "Martial Arts",
    owner: "Monk",
    modifiers: MONK_WEAPONS.map((weapon) => ({
      ...setFlag(`items.weapons.${stripSeparators(weapon)}.finesse`),
      requirements: [UNARMORED, NO_SHIELD],
    })),
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
  { feature: "Thieves' Cant", modifiers: [grantLanguage("Thieves' Cant"), languagePick()] },
  { feature: "Three Extra Attacks", modifiers: [setNum("combat.attacks", 4)] },
  { feature: "Two Extra Attacks", modifiers: [setNum("combat.attacks", 3)] },
  {
    feature: "Unarmored Defense",
    owner: "Barbarian",
    modifiers: [setFlag("combat.ac.unarmored.constitution")],
  },
  {
    feature: "Unarmored Defense",
    owner: "Monk",
    modifiers: [{ ...setFlag("combat.ac.unarmored.wisdom"), requirements: [NO_SHIELD] }],
  },
];

/**
 * The pool a feature gives a room in at each level it's gained at, by feature: its class's own (`owner`) when the class
 * has one for it, a paladin's Fighting Style's.
 */
export const FEATURE_POOLS: { feature: string; owner?: string; pool: string }[] = [
  { feature: "Ability Score Improvement", pool: ABILITY_SCORE_IMPROVEMENT_POOL },
  { feature: "Divine Order", pool: DIVINE_ORDER_POOL },
  { feature: "Epic Boon", pool: "Epic Boon" },
  { feature: "Fighting Style", pool: "Fighting Style" },
  // A paladin's and a ranger's, in their own pools, which their option joins (Blessed Warrior, Druidic Warrior)
  ...FIGHTING_STYLE_OPTION_CLASSES.map((owner) => ({
    feature: "Fighting Style",
    owner,
    pool: classFightingStyle(owner),
  })),
  { feature: "Primal Knowledge", pool: classSkills("Barbarian") },
  { feature: "Primal Order", pool: PRIMAL_ORDER_POOL },
];

/**
 * The features that give a spell room past a class's known spells, one at each level they're gained at, from a
 * spell level up, each in a pool of its own (`pool`, by spell level) that draws its class's list's spells of that
 * level alone: a warlock's Mystic Arcanum, a level 6 spell at 11, a level 7 one at 13, and so on.
 */
export const SPELL_ROOM_FEATURES: {
  feature: string;
  firstLevel: number;
  pool: (level: number) => string;
}[] = [{ feature: "Mystic Arcanum", firstLevel: 6, pool: mysticArcanum }];
