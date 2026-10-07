import type { FC } from "react";

import type { RulesetData, RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { CowData, Db } from "@/server/database/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type {
  Aptitude,
  Campaign,
  CharacterInventory,
  CharacterLevel,
  Character as CharacterRecord,
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

import type { RulesetEffects, RulesetRules } from "./module/index.ts";

type ProjectedFeat = Feat & {
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  klassLevelFeatId?: string;
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
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  klassLevelFeatId?: string;
  virtual?: boolean;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

export type CustomizedKlassLevel = KlassLevel & {
  properties: Property[];
  modifiers: Modifier[];
  requirements: Requirement[];
};

/**
 * Same shape rule as CustomizedFeat. `virtual: true` powers are spells granted
 * by `set powers.<slug>.<apt>.known = true` modifiers; their klass/character
 * level IDs are empty strings so per-level scans skip them. Pool accounting
 * relies on `virtual` (or `free`, for klass-granted powers).
 */
export type CustomizedPower = Power & {
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  free?: boolean;
  virtual?: boolean;
  saveName: string | null;
  powerLevel: number | null;
  properties: Property[];
  modifiers: Modifier[];
  requirements: Requirement[];
};

export type CustomizedRace = Race & {
  properties: Property[];
  modifiers: Modifier[];
  requirements: Requirement[];
};

export interface DetailedCharacterInterface {
  /** The character's rows its builds share, read through `database`, in `scope` when it's the character's ruleset's. */
  preload(database?: Db, scope?: RulesetScope): Promise<PreloadedCharacterData>;
  /**
   * Builds the character, in `scope` when it's the character's ruleset's (the one its caller holds, or a `preload()`'s,
   * whose shared rows it reads too): no build reads the ruleset or composes its view again.
   */
  build(database?: Db, projectedData?: unknown, scope?: RulesetScope | PreloadedCharacterData): Promise<void>;
  validate(): ValidationResult;
  formatRequirements(requirements: Requirement[]): string;
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean;
  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[];
  getRuleset(): Ruleset | undefined;
  getPlayer(): Player | undefined;
  getCampaign(): Campaign | undefined;
  readonly components: Components;
  getVirtuallyPossessedFeatIds(): string[];
  getVirtuallyPossessedPowerIds(): string[];
}

/** A built character and the sheet that renders it, typed by the module that made them. */
export type DetailedCharacterWithSheet<
  Character extends DetailedCharacterInterface = DetailedCharacterInterface,
  Kind extends string = string,
> = {
  detailedCharacter: Character;
  CharacterSheetComponent: FC<{
    detailedCharacter: Character;
    kind?: Kind;
    portraitUrl?: string | null;
  }>;
};

export type InventoryEntry = CharacterInventory & {
  item: Item & {
    properties: Property[];
    modifiers: Modifier[];
    /** The base item's requirements: its template's, or its own when it is one */
    proficiency: Requirement[];
    /** Its other requirements, which its modifiers need */
    requirements: Requirement[];
  };
};

/**
 * Generic level-up projector surface — only operations that apply to every
 * level-based RPG.
 *
 * Ruleset-specific methods (skill budgets, spell schools, skill-points-per-
 * level, class-skill enrichment, …) live on per-ruleset extensions, e.g.
 * `Dnd35LevelUpProjector` in `server/rulesets/dnd3.5/types.ts`.
 */
export interface LevelUpProjector {
  /** Evaluate whether candidate klass levels' requirements are met against
   *  a projected character state (including in-flight batch levels). */
  evaluateClassAvailability(
    candidates: { klassName: string; klassLevel: KlassLevel; requirementGroups: Requirement[][] }[],
    projectedCharacterLevel: CharacterLevel,
  ): Promise<Map<string, boolean>>;
}

/** Base result of character data loading. Rulesets extend with specific fields. */
export interface LoadedCharacterData {
  ruleset: Ruleset | undefined;
  player: Player | undefined;
  campaign: Campaign | undefined;
  rulesetAbilities: RulesetAbility[];
  rulesetSaves: RulesetSave[];
  rulesetSkills: Skill[];
  rulesetFeats: Feat[];
  rulesetFeatProperties: Property[];
  rulesetPowers: PowerWithAptitudes[];
  rulesetPowerProperties: Property[];
  rulesetAptitudes: Aptitude[];
  rulesetKlasses: Klass[];
  leveledAptitudeIds: Set<string>;
  /** The spell lists a feat brings (a domain's, a specialist's school): their spells come with it, never learned. */
  featListIds: Set<string>;
  characterAbilityScores: { abilityId: string; name: string; score: number }[];
  race: CustomizedRace;
  languages: Language[];
  inventory: InventoryEntry[];
  characterLevels: CharacterLevel[];
  klassLevels: CustomizedKlassLevel[];
  klassSkills: KlassSkill[];
  klassLevelSaves: KlassLevelSave[];
  klasses: Klass[];
  feats: CustomizedFeat[];
  skills: SkillWithRank[];
  powers: CustomizedPower[];
  klassLevelFeatCountsByAptitudeId: Record<string, number>;
  klassLevelPowerCountsByAptitudeId: Record<string, number>;
  modifiers: Modifier[];
  requirementGroups: Requirement[][];
  validRulesetIds: Set<string>;
}

/**
 * Shared character data, the loader's `loadSharedData`.
 * Returned by `detailedCharacter.preload()` and accepted by `build()` to avoid
 * duplicate DB queries when building the same character with different projections.
 */
export interface PreloadedCharacterData extends PreloadedRulesetData {
  /** Opaque bag of shared DB results — only consumed by DetailedCharacter.build() */
  _shared: unknown;
}

export interface PreloadedRulesetData {
  ruleset: Ruleset;
  cowData: CowData;
  rulesetData: RulesetData;
}

/**
 * Generic projected character data for requirement evaluation. Only carries
 * concepts common to every level-based system (character levels + feats).
 * Ruleset-specific projections (skill ranks, spell levels, save DCs, …) live
 * on per-ruleset extensions — e.g. `Dnd35ProjectedCharacterData` in
 * `server/rulesets/dnd3.5/types.ts`.
 */
export interface ProjectedCharacterData {
  excludeCharacterLevelIds?: string[];
  characterLevels?: CharacterLevel[];
  feats?: ProjectedFeat[];
  givenFeats?: ProjectedFeat[];
}

export interface PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: PropertyEntityType): Record<string, string>;
  getStaticPropertyValues(type: string): string[] | null;
}

export type RequirementIssue = {
  category: "requirements";
  message: string;
  entityName?: string;
  entityType?: string;
  requirementTree?: string;
};

/**
 * A base rules' module, typed by what it builds: its characters, its level-up projector and the kinds of character it
 * knows (`RulesetFactory` hands out each module's own type).
 */
export interface RulesetModule<
  Character extends DetailedCharacterInterface = DetailedCharacterInterface,
  Projector extends LevelUpProjector = LevelUpProjector,
  Kind extends string = string,
> {
  /** What the ruleset answers the services, without the database */
  rules: RulesetRules;
  /** What the ruleset does in a service's transaction */
  effects: RulesetEffects;
  seedTemplateItems(tx: Db, rulesetId: string): Promise<void>;
  createDetailedCharacter(record: CharacterRecord, kind?: Kind): Character;
  createLevelUpProjector(character: Character): Projector;
  createDetailedCharacterWithSheet(
    record: CharacterRecord,
    kind?: Kind,
  ): Promise<DetailedCharacterWithSheet<Character, Kind>>;
  createTargetPaths(): TargetPathsInterface;
  createPropertyTypes(): PropertyTypesProvider;
}

export type SkillWithRank = Skill & {
  klassLevelId: string;
  characterLevelId: string;
  rank: number;
};

export interface TargetPathsInterface extends TargetPathsTraverser {
  getTargetPathsAndLabels(
    rulesetData: RulesetData,
    kind: "modifier" | "requirement",
  ): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }>;
  getCategories(): string[];
  getCategoryDescriptions(): Record<string, string>;
  getPathDescriptions(): Record<string, string>;
  getGroupDescriptionTemplates(): Record<string, string>;
}
export interface TargetPathsTraverser {
  /** Whether a target reads its source itself (a weapon's own paths: the place its item is held), not the sheet. */
  readsSource(target: string): boolean;
  traversePathInit(target: string, components: Components, context?: { sourceId?: string }): TraversePathResult[];
}

export type TraversePathResult = {
  component: Component | null;
  object: unknown;
  data: unknown;
  key: string;
  resolvedPath: string | null;
  error: string | null;
};

export type ValidationIssue = {
  category: "aptitudes" | "skills" | "requirements" | "modifiers" | "integrity";
  message: string;
  entityName?: string;
  entityType?: string;
  requirementTree?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};
