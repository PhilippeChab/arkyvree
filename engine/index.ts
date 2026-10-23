/**
 * The engine's one entry, `Engine`: what the server (and the seeders and the codegen) ask of a ruleset's rules, through
 * a handle bound to its view and to what they're about (`Engine.for(scope).character(input).describe(…)`), each
 * operation on the data the caller read, answering data. Which ruleset answers is the engine's to know, from the
 * ruleset the caller hands it: nothing outside the engine imports anything else of it, but the handles' types.
 */

export type { default as ClassEngine } from "./api/ClassEngine.ts";
export { default as Engine } from "./api/Engine.ts";
export type { ImportFileDescription } from "./api/ImportsEngine.ts";
export type { default as LevelUpEngine } from "./api/LevelUpEngine.ts";
export type { Accepted, EntityKinds } from "./api/Modules.ts";
export type { CowData, RulesetSources } from "./core/cow/index.ts";
export type { EntityFieldValues, EntityForm, FormField } from "./core/fields/index.ts";
export type {
  AbilityIncrease,
  BondedPlan,
  CharacterInput,
  CharacterRows,
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
  LanguagesPlan,
  LevelPlanRequest,
  LevelQuery,
  LevelRequest,
  LevelRows,
  LevelWrites,
  ListLink,
  MadeEntity,
  NewBondedCreature,
  PickQuery,
  PlannedSoFar,
  PreviewRequest,
  RulesDescription,
  RulesWord,
  StepOption,
  StepOptionGroup,
  StepPayload,
  StepPickerQuery,
} from "./core/module/index.ts";
export { default as RulesError } from "./core/RulesError.ts";
export type { EntityCustomizations, RulesetData, RulesetRawData } from "./core/view/index.ts";
