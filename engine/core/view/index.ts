/**
 * A ruleset's view: its own rows and its source chain's, composed by copy-on-write (`RulesetComposition`) into the
 * `RulesetData` every read of a ruleset sees, the rules a sibling's rows merge by, and the entities a request names as
 * the view reads them (`RequestIds`), and what the engine calls each kind of entity (`KIND_LABELS`).
 */

export { KIND_LABELS } from "./kindLabels.ts";
export { default as RequestIds } from "./RequestIds.ts";
export type {
  Aptitude,
  CharacterAbility,
  CharacterLanguage,
  CharacterLevel,
  EntityRow,
  Feat,
  FeatWithAptitudes,
  Item,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelPower,
  KlassLevelSave,
  KlassSkill,
  Language,
  LevelAbilityIncrease,
  LevelFeat,
  LevelPower,
  LevelSkill,
  Mechanic,
  Power,
  PowerWithAptitudes,
  Race,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "./rows.ts";
export { default as RulesetComposition, type RulesetRawData } from "./RulesetComposition.ts";
export { default as RulesetData, type ViewEntities } from "./RulesetData.ts";
export type { RulesetView } from "./RulesetData.ts";
export { type EntityCustomizations, default as SiblingMerge } from "./SiblingMerge.ts";
