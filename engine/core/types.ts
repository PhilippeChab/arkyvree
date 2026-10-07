import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { TargetPath, TargetPathKind } from "@/shared/customization/target.ts";
import type {
  Aptitude,
  Campaign,
  CharacterInventory,
  CharacterLevel,
  Feat,
  Item,
  Klass,
  KlassLevel,
  KlassLevelSave,
  KlassSkill,
  Language,
  Modifier,
  Player,
  Power,
  PowerWithAptitudes,
  Property,
  Race,
  Requirement,
  Ruleset,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/shared/relations.ts";

import type { RulesetData } from "./view/index.ts";

type ProjectedFeat = Feat & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelFeatId?: string;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

/**
 * A character component (abilities, skills, combat, etc.): a class instance whose getters the target paths call
 * by name (`readComponent`).
 */
export type Component = object;

export type Components = Record<string, Component>;

/**
 * Feats live in one merged list whether they were picked, granted by a klass
 * level, or virtually possessed via a `set feats.<slug>.possessed = true`
 * modifier. Virtual entries carry `virtual: true` and use empty-string keys
 * for klass/character/aptitude IDs so existing per-level lookups (which key
 * by characterLevelId) skip them naturally without a flag check.
 */
export type CustomizedFeat = Feat & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelFeatId?: string;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
  virtual?: boolean;
};

export type CustomizedKlassLevel = KlassLevel & {
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

/**
 * Same shape rule as CustomizedFeat. `virtual: true` powers are spells granted
 * by `set powers.<slug>.<apt>.known = true` modifiers; their klass/character
 * level IDs are empty strings so per-level scans skip them. Pool accounting
 * relies on `virtual` (or `free`, for klass-granted powers).
 */
export type CustomizedPower = Power & {
  aptitudeId: string;
  characterLevelId: string;
  free?: boolean;
  klassLevelId: string;
  modifiers: Modifier[];
  powerLevel: number | null;
  properties: Property[];
  requirements: Requirement[];
  saveName: string | null;
  virtual?: boolean;
};

export type CustomizedRace = Race & {
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

export type InventoryEntry = CharacterInventory & {
  item: Item & {
    modifiers: Modifier[];
    /** The base item's requirements: its template's, or its own when it is one */
    proficiency: Requirement[];
    properties: Property[];
    /** Its other requirements, which its modifiers need */
    requirements: Requirement[];
  };
};

/** Base result of character data loading. Rulesets extend with specific fields. */
export interface LoadedCharacterData {
  campaign: Campaign | undefined;
  characterAbilityScores: { abilityId: string; name: string; score: number }[];
  characterLevels: CharacterLevel[];
  /** The spell lists a feat brings (a domain's, a specialist's school): their spells come with it, never learned. */
  featListIds: Set<string>;
  feats: CustomizedFeat[];
  inventory: InventoryEntry[];
  klasses: Klass[];
  klassLevelFeatCountsByAptitudeId: Record<string, number>;
  klassLevelPowerCountsByAptitudeId: Record<string, number>;
  klassLevels: CustomizedKlassLevel[];
  klassLevelSaves: KlassLevelSave[];
  klassSkills: KlassSkill[];
  languages: Language[];
  leveledAptitudeIds: Set<string>;
  modifiers: Modifier[];
  player: Player | undefined;
  powers: CustomizedPower[];
  race: CustomizedRace;
  requirementGroups: Requirement[][];
  ruleset: Ruleset | undefined;
  rulesetAbilities: RulesetAbility[];
  rulesetAptitudes: Aptitude[];
  rulesetFeatProperties: Property[];
  rulesetFeats: Feat[];
  rulesetKlasses: Klass[];
  rulesetPowerProperties: Property[];
  rulesetPowers: PowerWithAptitudes[];
  rulesetSaves: RulesetSave[];
  rulesetSkills: Skill[];
  skills: SkillWithRank[];
  validRulesetIds: Set<string>;
}

/**
 * Generic projected character data for requirement evaluation. Only carries
 * concepts common to every level-based system (character levels + feats).
 * Ruleset-specific projections (skill ranks, spell levels, save DCs, …) live
 * on per-ruleset extensions — e.g. `Dnd35ProjectedCharacterData` in
 * `engine/rulesets/dnd3.5/types.ts`.
 */
export interface ProjectedCharacterData {
  characterLevels?: ProjectedCharacterLevel[];
  excludeCharacterLevelIds?: string[];
  feats?: ProjectedFeat[];
  givenFeats?: ProjectedFeat[];
}

/**
 * A level a projection adds, as a saved one is but for its position: an edited level's stand-in takes the edited
 * level's, and a new level has none, the loader placing it after the saved levels in the order given.
 */
export type ProjectedCharacterLevel = Omit<CharacterLevel, "position"> & { position?: number };

export interface PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: PropertyEntityType): Record<string, string>;
  getStaticPropertyValues(type: string): string[] | null;
}

export type RequirementIssue = {
  category: "requirements";
  entityName?: string;
  entityType?: string;
  message: string;
  requirementTree?: string;
};

/** A ruleset as a character's build reads it: its row, and its view, composed by copy-on-write. */
export interface RulesetView {
  ruleset: Ruleset;
  rulesetData: RulesetData;
}

export type SkillWithRank = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

export interface TargetPathsInterface extends TargetPathsTraverser {
  getCategories(): string[];
  getCategoryDescriptions(): Record<string, string>;
  getGroupDescriptionTemplates(): Record<string, string>;
  getPathDescriptions(): Record<string, string>;
  getTargetPathsAndLabels(
    rulesetData: RulesetData,
    kind: TargetPathKind,
  ): { paths: TargetPath[]; segmentLabels: Record<string, string> };
}
export interface TargetPathsTraverser {
  /** Whether a target reads its source itself (a weapon's own paths: the place its item is held), not the sheet. */
  readsSource(target: string): boolean;
  traversePathInit(target: string, components: Components, context?: { sourceId?: string }): TraversePathResult[];
}

export type TraversePathResult = {
  component: Component | null;
  data: unknown;
  error: string | null;
  key: string;
  object: unknown;
  resolvedPath: string | null;
};

export type ValidationIssue = {
  category: "aptitudes" | "skills" | "requirements" | "modifiers" | "integrity";
  entityName?: string;
  entityType?: string;
  message: string;
  requirementTree?: string;
};

export type ValidationResult = {
  issues: ValidationIssue[];
  valid: boolean;
};
