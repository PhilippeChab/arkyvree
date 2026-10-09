/**
 * The engine's one entry: what the server (and the seeders and the codegen) ask of a ruleset's rules, each an operation
 * on the data the caller read, answering data. Which ruleset answers is the engine's to know, from the ruleset the
 * caller hands it: nothing outside the engine imports anything else of it.
 */

export {
  checkCharacterLanguages,
  describeCampaignCharacter,
  describeCharacter,
  describeCharacterCards,
  describeCharacterSheet,
  describeInventory,
  openRacePicker,
  planCharacterCreate,
  planInventoryEntry,
} from "./api/characters.ts";
export { listBookTargetPaths, toEntityProperties } from "./api/content.ts";
export {
  describeModifier,
  describeModifierList,
  describeModifiers,
  describeProperties,
  describeRequirements,
  planModifierCreate,
  planModifierDelete,
  planModifierEdit,
  planPropertyCreate,
  planPropertyDelete,
  planPropertyEdit,
  planRequirementCreate,
  planRequirementDelete,
  planRequirementEdit,
} from "./api/customizations.ts";
export {
  describeClass,
  describeClassFeatPools,
  describeClassLevel,
  describeClassLevels,
  describeClassLevelWithClass,
  describeClassSkills,
  describeClassSpellLists,
  describeClassSpells,
  describeClassSpellsKnown,
  describeEntity,
  describeItem,
  describeItems,
  describeSkill,
  describeSkills,
  getEntity,
  openFeatList,
  openPowerList,
  planAptitudeDelete,
  planAptitudeEdit,
  planClassCreate,
  planClassLevelCreate,
  planClassLevelDelete,
  planClassLevelEdit,
  planClassSkillAdd,
  planClassSkillRemove,
  planFeatCreate,
  planFeatEdit,
  planItemCreate,
  planItemDelete,
  planItemEdit,
  planItemVariants,
  planPowerCreate,
  planPowerEdit,
  planSkillCreate,
  planSkillDelete,
  planSkillEdit,
} from "./api/entities.ts";
export {
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
  planLevelRemoval,
  planLevelUp,
} from "./api/levelUp.ts";
export { checkTargetValue, getTargetPathCompletions, listTargetPaths, validateTargetPath } from "./api/paths.ts";
export { getPropertyTypeCompletions, getPropertyValueCompletions, listPropertyTypes } from "./api/properties.ts";
export {
  buildCowData,
  buildRulesetView,
  buildSourceChain,
  checkExtensionNames,
  checkPublishable,
  getCowReads,
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
