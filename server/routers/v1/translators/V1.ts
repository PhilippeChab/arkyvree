import { toV1Character, toV1Characters, toV1Inventory, toV1LinkRoom, toV1Modifiers } from "./characters.ts";
import {
  toV1Entity,
  toV1EntityGroup,
  toV1EntityLinks,
  toV1EntitySummary,
  toV1EntityTable,
  toV1LabeledModifiers,
  toV1LabeledRequirements,
  toV1OwnedEntity,
  toV1Progression,
  toV1StoredEntity,
} from "./entities.ts";
import { toV1LevelPlan, toV1LevelPlanAnswer, toV1LevelSteps, toV1StepOptions } from "./levels.ts";
import { toV1Page } from "./pages.ts";
import { toV1Rules } from "./rules.ts";
import {
  toV1Ruleset,
  toV1RulesetChanges,
  toV1RulesetExtensions,
  toV1RulesetSettings,
  toV1RulesetSummary,
} from "./rulesets.ts";

/**
 * Version 1's translators: from what a service answers to v1's shape. Each is typed by the service it reads and by
 * v1's schema of its answer (`schemas/`), so an answer that changes inside the app stops its translator compiling
 * until v1's shape is kept. A new version copies the last, replacing only what changed (`const V2 = { ...V1, … }`),
 * and v1 keeps working untouched.
 */
export const V1 = {
  character: toV1Character,
  characters: toV1Characters,
  entity: toV1Entity,
  entityGroup: toV1EntityGroup,
  entityLinks: toV1EntityLinks,
  entitySummary: toV1EntitySummary,
  entityTable: toV1EntityTable,
  inventory: toV1Inventory,
  labeledModifiers: toV1LabeledModifiers,
  labeledRequirements: toV1LabeledRequirements,
  levelPlan: toV1LevelPlan,
  levelPlanAnswer: toV1LevelPlanAnswer,
  levelSteps: toV1LevelSteps,
  linkRoom: toV1LinkRoom,
  modifiers: toV1Modifiers,
  ownedEntity: toV1OwnedEntity,
  page: toV1Page,
  rules: toV1Rules,
  progression: toV1Progression,
  ruleset: toV1Ruleset,
  rulesetChanges: toV1RulesetChanges,
  rulesetExtensions: toV1RulesetExtensions,
  rulesetSettings: toV1RulesetSettings,
  rulesetSummary: toV1RulesetSummary,
  stepOptions: toV1StepOptions,
  storedEntity: toV1StoredEntity,
};
