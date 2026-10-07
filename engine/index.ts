/**
 * The engine's one entry: what the server (and the seeders and the codegen) ask of a ruleset's rules, each an operation
 * on the data the caller read, answering data. Which ruleset answers is the engine's to know, from the ruleset the
 * caller hands it: nothing outside the engine imports anything else of it.
 */

export {
  checkEquipping,
  describeCharacter,
  describeCharacterSheet,
  describePartialCharacter,
  openRacePicker,
} from "./api/characters.ts";
export {
  checkAptitudeEdit,
  describeClass,
  describeClassFeatPools,
  describeClassLevels,
  describeClassSpellLists,
  describeClassSpells,
  describeClassSpellsKnown,
  describeSkills,
  planClassLevelSave,
  planItemSave,
  planPowerSave,
  planSkillDelete,
  planSkillSave,
} from "./api/entities.ts";
export {
  checkCharacter,
  describeLevel,
  getAttributeSlots,
  getFeatSlots,
  getLevelUpPreview,
  getPowerSlots,
  getSkillSlots,
  openClassPicker,
  openFeatPicker,
  openPowerPicker,
  planBondedCreatures,
  planLevelEdit,
  planLevelUp,
} from "./api/levelUp.ts";
export { checkTargetValue, getTargetPathCompletions, listTargetPaths, validateTargetPath } from "./api/paths.ts";
export { getPropertyTypes, getPropertyValues } from "./api/properties.ts";
export { buildCowData, buildRulesetView } from "./api/rulesets.ts";
export {
  buildSourceChain,
  checkExtensionNames,
  type CowData,
  type CowRows,
  getCowReads,
  getPairedKlassIds,
  type RulesetSources,
} from "./core/cow/index.ts";
export type {
  CharacterInput,
  CharacterRows,
  EntityWrites,
  GeneratedFeatRemoval,
  GeneratedFeatsWrite,
  PropertiesWrite,
  RequirementWrite,
} from "./core/module/index.ts";
export { default as RulesError } from "./core/RulesError.ts";
export type { RulesetView } from "./core/types.ts";
export {
  type EntityCustomizations,
  getListFeatIds,
  getListPowerIds,
  mergeSiblingAptitudeLinks,
  mergeSiblingCustomizations,
  type RulesetData,
  type RulesetRawData,
} from "./core/view/index.ts";
