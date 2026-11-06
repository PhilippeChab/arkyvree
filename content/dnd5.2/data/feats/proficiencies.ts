/**
 * The proficiencies a class grants, each a feat no reference gives: a saving throw's (one per ability), an armor
 * training's (Light, Medium and Heavy armor, and Shields), a category of weapons' (Simple, Martial) and a weapon's (a
 * monk's Shortswords, a rogue's Rapiers). Each is granted, never picked.
 */

import { setFlag } from "@/content/core/builders/customization/modifiers.ts";
import {
  ARMOR_TRAINING_POOL,
  SAVING_THROW_PROFICIENCIES_POOL,
  WEAPON_PROFICIENCIES_POOL,
} from "@/content/dnd5.2/builders/aptitudes/names.ts";
import {
  armorTraining,
  savingThrowProficiency,
  weaponProficiency,
} from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import type { FeatFields, FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";
import { ARMOR_CATEGORIES } from "@/vocabulary/dnd5.2/armor.ts";
import { FEAT_FAMILY, FEAT_GENERATED, FEAT_SELECTABLE } from "@/vocabulary/dnd5.2/fields/index.ts";
import { WEAPON_CATEGORIES, WEAPON_NAMES } from "@/vocabulary/dnd5.2/weapons.ts";

/** An armor training's feat's fields: granted, never picked, of its family. */
const ARMOR_TRAINING_FIELDS: FeatFields = {
  [FEAT_SELECTABLE]: false,
  [FEAT_GENERATED]: true,
  [FEAT_FAMILY]: ["Armor Training"],
};

/** A weapon proficiency's feat's fields: granted, never picked, of its family. */
const WEAPON_PROFICIENCY_FIELDS: FeatFields = {
  [FEAT_SELECTABLE]: false,
  [FEAT_GENERATED]: true,
  [FEAT_FAMILY]: ["Weapon Proficiency"],
};

/** The armor trainings: each category of armor's, then the Shields'. */
export const ARMOR_TRAINING_FEATS: FeatSeed[] = [
  ...ARMOR_CATEGORIES.map((category) => ({
    name: armorTraining(`${category} Armor`),
    description: `You have training with ${category} armor: you can wear it without its penalties to your D20 Tests and your spellcasting.`,
    aptitudes: [ARMOR_TRAINING_POOL],
    modifiers: [setFlag(`combat.armortraining.${stripSeparators(category)}`)],
    fields: ARMOR_TRAINING_FIELDS,
  })),
  {
    name: armorTraining("Shields"),
    description: "You have training with Shields: you gain a Shield's Armor Class bonus while you hold one.",
    aptitudes: [ARMOR_TRAINING_POOL],
    modifiers: [setFlag("combat.armortraining.shields")],
    fields: ARMOR_TRAINING_FIELDS,
  },
];

/** A saving throw's proficiency per ability, which a class grants its first level's two. */
export const SAVING_THROW_PROFICIENCY_FEATS: FeatSeed[] = ABILITY_NAMES.map((ability) => ({
  name: savingThrowProficiency(ability),
  description: `You have proficiency in ${ability} saving throws: you add your Proficiency Bonus to them.`,
  aptitudes: [SAVING_THROW_PROFICIENCIES_POOL],
  modifiers: [setFlag(`saves.${stripSeparators(ability)}.proficient`)],
  fields: { [FEAT_SELECTABLE]: false, [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Saving Throw Proficiency"] },
}));

/**
 * The weapon proficiencies: each category of weapons' (every Simple weapon, every Martial one), then each weapon's
 * (`items.weapons.<weapon>.proficient`), which a class grants one kind of martial weapon at a time by.
 */
export const WEAPON_PROFICIENCY_FEATS: FeatSeed[] = [
  ...WEAPON_CATEGORIES.map((category) => ({
    name: weaponProficiency(`${category} Weapons`),
    description: `You have proficiency with ${category} weapons: you add your Proficiency Bonus to your attack rolls with them.`,
    aptitudes: [WEAPON_PROFICIENCIES_POOL],
    modifiers: [setFlag(`items.weapons.${stripSeparators(category)}.proficient`)],
    fields: WEAPON_PROFICIENCY_FIELDS,
  })),
  ...WEAPON_NAMES.map((weapon) => ({
    name: weaponProficiency(weapon),
    description: `You have proficiency with the ${weapon}: you add your Proficiency Bonus to your attack rolls with it.`,
    aptitudes: [WEAPON_PROFICIENCIES_POOL],
    modifiers: [setFlag(`items.weapons.${stripSeparators(weapon)}.proficient`)],
    fields: WEAPON_PROFICIENCY_FIELDS,
  })),
];
