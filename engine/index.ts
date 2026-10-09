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
export { listBookTargetPaths, toEntityProperties } from "./api/content.ts";
export {
  checkAptitudeEdit,
  describeClass,
  describeClassFeatPools,
  describeClassLevels,
  describeClassSpellLists,
  describeClassSpells,
  describeClassSpellsKnown,
  describeSkills,
  getFeatFamilyType,
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
export {
  buildCowData,
  buildRulesetView,
  buildSourceChain,
  checkExtensionNames,
  getCowReads,
  getListFeatIds,
  getListPowerIds,
  getPairedKlassIds,
  mergeSiblingAptitudeLinks,
  mergeSiblingCustomizations,
  NAME_PAIRED_ENTITY_TYPES,
} from "./api/rulesets.ts";
export type { CowData, RulesetSources } from "./core/cow/index.ts";
export type {
  CharacterInput,
  CharacterRows,
  EntityWrites,
  GeneratedFeatRemoval,
  GeneratedFeatsWrite,
} from "./core/module/index.ts";
export { default as RulesError } from "./core/RulesError.ts";
export type { RulesetView } from "./core/types.ts";
export type { EntityCustomizations, RulesetData, RulesetRawData } from "./core/view/index.ts";
/** The one base rules' today: a second module's fields and limits join these, which a route validates a body with */
export { ENTITY_FIELDS, RULESET_LIMITS } from "./rulesets/dnd3.5/index.ts";
