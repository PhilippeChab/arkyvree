import type { FC } from "react";

import type { RulesetData, RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { CowData, Db } from "@/server/database/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { TargetPath, TargetPathKind } from "@/shared/customization/target.ts";
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

export interface DetailedCharacterInterface {
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean;
  /**
   * Builds the character, in `scope` when it's the character's ruleset's (the one its caller holds, or a `preload()`'s,
   * whose shared rows it reads too): no build reads the ruleset or composes its view again.
   */
  build(database?: Db, projectedData?: unknown, scope?: RulesetScope | PreloadedCharacterData): Promise<void>;
  readonly components: Components;
  formatRequirements(requirements: Requirement[]): string;
  getCampaign(): Campaign | undefined;
  getPlayer(): Player | undefined;
  getRuleset(): Ruleset | undefined;
  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[];
  getVirtuallyPossessedFeatIds(): string[];
  getVirtuallyPossessedPowerIds(): string[];
  /** The character's rows its builds share, read through `database`, in `scope` when it's the character's ruleset's. */
  preload(database?: Db, scope?: RulesetScope): Promise<PreloadedCharacterData>;
  validate(): ValidationResult;
}

/** A built character and the sheet that renders it, typed by the module that made them. */
export type DetailedCharacterWithSheet<
  Character extends DetailedCharacterInterface = DetailedCharacterInterface,
  Kind extends string = string,
> = {
  CharacterSheetComponent: FC<{
    detailedCharacter: Character;
    kind?: Kind;
    portraitUrl?: string | null;
  }>;
  detailedCharacter: Character;
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
    candidates: { klassLevel: KlassLevel; klassName: string; requirementGroups: Requirement[][] }[],
    projectedCharacterLevel: ProjectedCharacterLevel,
  ): Promise<Map<string, boolean>>;
}

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
 * Shared character data, the loader's `loadSharedData`.
 * Returned by `detailedCharacter.preload()` and accepted by `build()` to avoid
 * duplicate DB queries when building the same character with different projections.
 */
export interface PreloadedCharacterData extends PreloadedRulesetData {
  /** Opaque bag of shared DB results — only consumed by DetailedCharacter.build() */
  _shared: unknown;
}

export interface PreloadedRulesetData {
  cowData: CowData;
  ruleset: Ruleset;
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

/**
 * A base rules' module, typed by what it builds: its characters, its level-up projector and the kinds of character it
 * knows (`RulesetFactory` hands out each module's own type).
 */
export interface RulesetModule<
  Character extends DetailedCharacterInterface = DetailedCharacterInterface,
  Projector extends LevelUpProjector = LevelUpProjector,
  Kind extends string = string,
> {
  createDetailedCharacter(record: CharacterRecord, kind?: Kind): Character;
  createDetailedCharacterWithSheet(
    record: CharacterRecord,
    kind?: Kind,
  ): Promise<DetailedCharacterWithSheet<Character, Kind>>;
  createLevelUpProjector(character: Character): Projector;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPathsInterface;
  /** What the ruleset does in a service's transaction */
  effects: RulesetEffects;
  /** What the ruleset answers the services, without the database */
  rules: RulesetRules;
  seedTemplateItems(tx: Db, rulesetId: string): Promise<void>;
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
  ): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }>;
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
