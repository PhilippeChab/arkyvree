/**
 * What a reference's proficiencies name, as the database writes them ("Saving Throw: STR", "All armor", "Martial
 * Weapons", "Hand crossbows", "Skill: Athletics", "Tool: Thieves' Tools", "Herbalism Kit"): the abilities, the skills,
 * the tools and the feats they are; and the options of a choice among them.
 */

import { ABILITY_ABBREVIATIONS } from "@/codegen/dnd5.2/tools/terms/words.ts";
import type { Choice } from "@/codegen/dnd5.2/tools/types/common.ts";
import {
  armorTraining,
  savingThrowProficiency,
  skillProficiency,
  toolProficiency,
  weaponProficiency,
} from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { ARMOR_CATEGORIES } from "@/vocabulary/dnd5.2/armor.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd5.2/skills.ts";
import { WEAPON_CATEGORIES, WEAPON_NAMES } from "@/vocabulary/dnd5.2/weapons.ts";

/** The prefix the database names a skill's proficiency with ("Skill: Athletics"). */
const SKILL_PREFIX = "Skill: ";

/** The prefix the database names some tools' proficiencies with ("Tool: Thieves' Tools"). */
const TOOL_PREFIX = "Tool: ";

/** The names `options` give, a choice's own options' when one nests a choice (a monk's artisan's tools or instrument). */
function optionNames(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option: unknown) => {
    if (!isRecord(option)) return [];
    if (isRecord(option.item) && typeof option.item.name === "string") return [option.item.name];
    if (isRecord(option.choice) && isRecord(option.choice.from)) return optionNames(option.choice.from.options);
    return [];
  });
}

/** A weapon the database names in the plural, any case ("Hand crossbows": Hand Crossbow): none for another name. */
function readWeapon(name: string): string | undefined {
  const plural = name.toLowerCase();
  return WEAPON_NAMES.find((weapon) => `${weapon.toLowerCase()}s` === plural || weapon.toLowerCase() === plural);
}

/** An ability, by the abbreviation the database writes it with ("STR": Strength): an unknown one throws. */
export function readAbility(abbreviation: string): string {
  const ability = ABILITY_ABBREVIATIONS[abbreviation.toUpperCase()];
  if (!ability) throw new Error(`"${abbreviation}" names no ability`);
  return ability;
}

/** The names a choice is among, its nested choices' options among them, as the database writes them. */
export function readChoiceOptions(choice: Choice): string[] {
  return optionNames(choice.from.options);
}

/**
 * The feats a proficiency the database names is, the content's names for them (`builders/feats/proficiencies.ts`): a
 * saving throw's, an armor training's (all armor's three), a category of weapons' or a weapon's, a skill's, or one of
 * `tools`' (with or without its "Tool: " prefix). A name of none of them throws.
 */
export function readProficiencyFeats(name: string, tools: readonly string[]): string[] {
  const save = /^Saving Throw: (\w+)$/.exec(name);
  if (save) return [savingThrowProficiency(readAbility(save[1]))];
  if (name.toLowerCase() === "all armor") return ARMOR_CATEGORIES.map((category) => armorTraining(`${category} Armor`));
  const armor = ARMOR_CATEGORIES.find((category) => name.toLowerCase() === `${category} armor`.toLowerCase());
  if (armor) return [armorTraining(`${armor} Armor`)];
  if (name.toLowerCase() === "shields") return [armorTraining("Shields")];
  const category = WEAPON_CATEGORIES.find((weapons) => name.toLowerCase() === `${weapons} weapons`.toLowerCase());
  if (category) return [weaponProficiency(`${category} Weapons`)];
  const weapon = readWeapon(name);
  if (weapon) return [weaponProficiency(weapon)];
  const skill = readSkill(name);
  if (skill) return [skillProficiency(skill)];
  const tool = readTool(name, tools);
  if (tool) return [toolProficiency(tool)];
  throw new Error(`"${name}" is no proficiency the generator knows`);
}

/** A skill the database names, with or without its "Skill: " prefix ("Skill: Animal Handling", a trait's "Insight"). */
export function readSkill(name: string): string | undefined {
  const skill = name.startsWith(SKILL_PREFIX) ? name.slice(SKILL_PREFIX.length) : name;
  return SKILL_NAMES.find((known) => known === skill);
}

/** One of `tools` the database names, any case, with or without its "Tool: " prefix: none for another name. */
export function readTool(name: string, tools: readonly string[]): string | undefined {
  const bare = (name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name).toLowerCase();
  return tools.find((tool) => tool.toLowerCase() === bare);
}
