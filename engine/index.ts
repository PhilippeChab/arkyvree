/**
 * The engine's one entry, `Engine`: what the server (and the seeders and the codegen) ask of a ruleset's rules, through
 * a handle bound to its view and to what they're about (`Engine.for(scope).character(input).describe(…)`), each
 * operation on the data the caller read, answering data. Which ruleset answers is the engine's to know, from the
 * ruleset the caller hands it: nothing outside the engine imports anything else of it, but the handles' types.
 */

export type { StoredRulesetRows } from "./api/CopyOnWriteEngine.ts";
export { default as Engine } from "./api/Engine.ts";
export type { ImportFileDescription } from "./api/ImportsEngine.ts";
export type { default as LevelUpEngine } from "./api/LevelUpEngine.ts";
export type { Accepted, EntityKinds } from "./api/Modules.ts";
export type { ProgressionForm } from "./api/RulesetEngine.ts";
export type { default as StorageEngine } from "./api/StorageEngine.ts";
export type { CowData, CowRows, RulesetSources } from "./core/cow/index.ts";
export type { EntityAction } from "./core/entities/index.ts";
export type { EntityFieldValues, EntityForm, FormField } from "./core/fields/index.ts";
export type {
  CharacterAdvancement,
  CharacterCard,
  CharacterInput,
  CharacterLinks,
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
  ImportOwner,
  ImportPlan,
  ImportReportDescription,
  ImportSource,
  JoinRows,
  LevelPlanRequest,
  LevelRows,
  LevelWrites,
  LinkPart,
  LinkPicksPlan,
  LinkPlan,
  ListLink,
  MadeEntity,
  NewChild,
  ProgressionPlan,
  RulesDescription,
  RulesWord,
  StepOption,
  StepOptionGroup,
  StepPayload,
  StepPickerQuery,
  StorageRegistries,
  StoredAdvancement,
  StoredCharacterLink,
  StoredCharacterRow,
  StoredCharacterWrite,
  StoredColumn,
  StoredEntity,
  StoredFieldValue,
  StoredLink,
  StoredPick,
  StoredRuleset,
  StoredWrite,
  ValueKind,
} from "./core/module/index.ts";
export { default as RulesError } from "./core/RulesError.ts";
export type {
  EntityCustomizations,
  EntityRow,
  OwnedKind,
  RulesetData,
  RulesetRawData,
  ViewEntities,
  ViewJoins,
} from "./core/view/index.ts";
