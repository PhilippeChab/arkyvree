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
export type { CowData, CowRows, RulesetSources } from "./core/cow/index.ts";
export type { EntityAction } from "./core/entities/index.ts";
export type { EntityFieldValues, EntityForm } from "./core/fields/index.ts";
export type {
  CharacterAdvancement,
  CharacterCard,
  CharacterInput,
  CharacterRows,
  ChildPlan,
  CreationPickQuery,
  EntityCopies,
  EntityCreatePlan,
  EntityDeletePlan,
  EntityEditPlan,
  EntityRemoval,
  EntityWrites,
  FieldsRequest,
  FieldValue,
  JoinRows,
  LevelPlanRequest,
  LevelRows,
  LinkPicksPlan,
  LinkPlan,
  ListLink,
  MadeEntity,
  NewChild,
  ProgressionPlan,
  StepOption,
  StepOptionGroup,
  StepPickerQuery,
  StorageRegistries,
  StoredCharacterLink,
  StoredCharacterRow,
  StoredCharacterWrite,
  StoredEntity,
  StoredLink,
  StoredPick,
  StoredRuleset,
  StoredWrite,
} from "./core/module/index.ts";
export { default as RulesError } from "./core/RulesError.ts";
export type {
  EntityCustomizations,
  EntityRow,
  OwnedKind,
  RulesetData,
  RulesetRawData,
  ViewEntities,
} from "./core/view/index.ts";
