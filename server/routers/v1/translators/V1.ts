import { toV1CharacterLanguages, toV1Inventory, toV1SavedLevel } from "./characterParts.ts";
import { toV1Character, toV1Characters } from "./characters.ts";
import {
  toV1Class,
  toV1ClassLevel,
  toV1ClassProgression,
  toV1ClassSkills,
  toV1Entity,
  toV1Feat,
  toV1Item,
  toV1Language,
  toV1Modifier,
  toV1Names,
  toV1Race,
  toV1Requirement,
  toV1Save,
  toV1Skill,
  toV1Spell,
} from "./content.ts";
import { toLevelChoicesQuery, toV1LevelChoices } from "./levelChoices.ts";
import { toV1Page } from "./pages.ts";
import {
  toV1FieldDeclarations,
  toV1Ruleset,
  toV1RulesetChanges,
  toV1RulesetExtensions,
  toV1RulesetSettings,
} from "./rulesets.ts";

/**
 * Version 1's translators, one per kind: from what a service answers to v1's shape, and from a v1 request to what a
 * service takes (`levelChoicesQuery`). Each is typed by the service it reads and by v1's schema of its answer
 * (`schemas/`), so an answer that changes inside the app stops its translator compiling until v1's shape is kept. A
 * page's items are each translated by their kind's (`V1.page(feats, V1.feat)`). A new version copies the last,
 * replacing only what changed (`const V2 = { ...V1, character: … }`), and v1 keeps working untouched.
 */
export const V1 = {
  character: toV1Character,
  characterLanguages: toV1CharacterLanguages,
  characters: toV1Characters,
  class: toV1Class,
  classLevel: toV1ClassLevel,
  classProgression: toV1ClassProgression,
  classSkills: toV1ClassSkills,
  entity: toV1Entity,
  feat: toV1Feat,
  fieldDeclarations: toV1FieldDeclarations,
  inventory: toV1Inventory,
  item: toV1Item,
  language: toV1Language,
  levelChoices: toV1LevelChoices,
  levelChoicesQuery: toLevelChoicesQuery,
  modifier: toV1Modifier,
  names: toV1Names,
  page: toV1Page,
  race: toV1Race,
  requirement: toV1Requirement,
  ruleset: toV1Ruleset,
  rulesetChanges: toV1RulesetChanges,
  rulesetExtensions: toV1RulesetExtensions,
  rulesetSettings: toV1RulesetSettings,
  save: toV1Save,
  savedLevel: toV1SavedLevel,
  skill: toV1Skill,
  spell: toV1Spell,
};
