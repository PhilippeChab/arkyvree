/**
 * The engine's one entry, `Engine`: what the server (and the seeders and the codegen) ask of a ruleset's rules, through
 * a handle bound to its view and to what they're about (`Engine.for(scope).character(input).describe(…)`), each
 * operation on the data the caller read, answering data. Which ruleset answers is the engine's to know, from the
 * ruleset the caller hands it: nothing outside the engine imports anything else of it, but the handles' types.
 */

export { default as Engine } from "./api/Engine.ts";
export type { default as LevelUpEngine } from "./api/LevelUpEngine.ts";
export type { Accepted, EntityKinds } from "./api/Modules.ts";
export type { ProgressionForm } from "./api/RulesetEngine.ts";
export type { default as StorageEngine } from "./api/StorageEngine.ts";
export type { CowData, CowRows, RulesetSources } from "./core/cow/index.ts";
export type { EntityAction } from "./core/entities/index.ts";
export type {
  EntityFieldValues,
  EntityForm,
  EntityLinkValues,
  FieldsWrite,
  StoredValues,
} from "./core/fields/index.ts";
export type {
  AdvancementPlan,
  CharacterCard,
  CharacterInput,
  CharacterRows,
  ChildPlan,
  CreationPickQuery,
  EntityCopies,
  EntityCopiesPlan,
  EntityCreatePlan,
  EntityDeletePlan,
  EntityEditPlan,
  EntityFilters,
  EntityRecord,
  EntityRemoval,
  EntityWrite,
  EntityWrites,
  FieldsRequest,
  FieldValue,
  FieldWrite,
  LevelEditPlan,
  LevelPlanRequest,
  LinkPicksPlan,
  LinkPlan,
  LinkSet,
  LinkWrite,
  MadeEntity,
  NewChild,
  PickPlan,
  ProgressionPlan,
  SettingsForm,
  StepOption,
  StepOptionGroup,
  StepPickerQuery,
  StorageRegistries,
  StoredAdvancement,
  StoredCharacterLink,
  StoredEntity,
  StoredLink,
  StoredPick,
  StoredRuleset,
} from "./core/module/index.ts";
export { default as RulesError } from "./core/RulesError.ts";
export type {
  EntityCustomizations,
  OwnedKind,
  RulesetData,
  RulesetRawData,
  ViewEntity,
  ViewKinds,
  ViewLink,
} from "./core/view/index.ts";
