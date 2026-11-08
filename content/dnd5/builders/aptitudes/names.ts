/**
 * The names of the pools the content names: a class's (its features, spell list, skill picks, subclass), a species'
 * (its traits, its lineage), a background's ability score increases, the tool picks a class or a background gives, and
 * the pools of the proficiencies a feat grants, each a family's.
 */

import { CLASS_FEATURE_POOL_SUFFIX } from "@/vocabulary/dnd5/classes.ts";

/** The pool of every armor training, a feat per category of armor and the Shields' (granted, never picked). */
export const ARMOR_TRAINING_POOL = "Armor Training";

/** A cleric's Divine Order: its sacred roles, a feat each, one picked at its first level. */
export const DIVINE_ORDER_POOL = "Divine Order";

/** A druid's Primal Order: its sacred roles, a feat each, one picked at its first level. */
export const PRIMAL_ORDER_POOL = "Primal Order";

/** The pool of every saving throw's proficiency, a feat per ability (granted, never picked). */
export const SAVING_THROW_PROFICIENCIES_POOL = "Saving Throw Proficiencies";

/** The pool of every tool's proficiency, a feat per tool, which a class's or a background's tool picks list too. */
export const TOOL_PROFICIENCIES_POOL = "Tool Proficiencies";

/** The pool of the weapons' mastery, a feat per weapon, which a class's Weapon Mastery gives room in. */
export const WEAPON_MASTERY_POOL = "Weapon Mastery";

/** The pool of every weapon proficiency, a feat per category of weapons and per weapon (granted, never picked). */
export const WEAPON_PROFICIENCIES_POOL = "Weapon Proficiencies";

/** A background's ability score increases ("Sage Ability Scores"): its ways to spread them, a feat each. */
export function backgroundAbilityScores(background: string): string {
  return `${background} Ability Scores`;
}

/** A class's features ("Fighter Features"): each its levels grant, its subclasses' and its proficiencies' too. */
export function classFeatures(className: string): string {
  return `${className} ${CLASS_FEATURE_POOL_SUFFIX}`;
}

/**
 * The pool a class's Fighting Style picks in when it has an option of its own ("Paladin Fighting Style"): the Fighting
 * Style feats and the option.
 */
export function classFightingStyle(className: string): string {
  return `${className} Fighting Style`;
}

/** A class's skill picks ("Fighter Skills"): its starting proficiencies give room in it. */
export function classSkills(className: string): string {
  return `${className} Skills`;
}

/** A class's spell list ("Wizard Spells"), its spells listed at their levels, which its levels' rooms are in. */
export function classSpells(className: string): string {
  return `${className} Spells`;
}

/** A class's subclass pick ("Fighter Subclass"): its level 3 gives room in it, its subclasses its feats. */
export function classSubclass(className: string): string {
  return `${className} Subclass`;
}

/**
 * A warlock's Mystic Arcanum at a spell level ("Mystic Arcanum (Level 6)"): its one spell of that level, the warlock's
 * list's spells of that level its options, apart from its known spells, which its Pact Magic's slots cap.
 */
export function mysticArcanum(level: number): string {
  return `Mystic Arcanum (Level ${level})`;
}

/** A species' lineage pick ("Elf Lineage"): the species gives room in it, its subspecies its feats. */
export function speciesLineage(species: string): string {
  return `${species} Lineage`;
}

/** A species' traits ("Elf Traits"), each a feat the species grants. */
export function speciesTraits(species: string): string {
  return `${species} Traits`;
}

/**
 * The pick of the ability a feat's spells are cast with ("Magic Initiate (Wizard) Ability"): Intelligence, Wisdom or
 * Charisma, a feat each.
 */
export function spellcastingAbilityPool(featName: string): string {
  return `${featName} Ability`;
}

/**
 * The tools a class or a background picks a proficiency among ("Bard Tools", "Soldier Tools"), whose Tool Proficiency
 * feats it lists.
 */
export function toolPicks(owner: string): string {
  return `${owner} Tools`;
}
