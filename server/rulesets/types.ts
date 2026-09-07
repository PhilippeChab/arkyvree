import type { FC } from "react";

import type { CachedCowData, CachedRulesetData } from "@/server/cache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type { ValidationResult } from "@/server/rulesets/AbstractDetailedCharacter.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";
import type {
  Aptitude,
  Campaign,
  Character as CharacterRecord,
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
import type { EntityType } from "@/shared/customization/properties.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { ServiceHooks } from "./hooks/index.ts";

export interface PreloadedRulesetData {
  ruleset: Ruleset;
  cowData: CachedCowData;
  rulesetData: CachedRulesetData;
}

// ── Entity types with attached Properties/Modifiers/Requirements ───

export type RaceWithPMR = Race & {
  properties: Property[];
  modifiers: Modifier[];
  requirements: Requirement[];
};

export type KlassLevelWithPMR = KlassLevel & {
  properties: Property[];
  modifiers: Modifier[];
  requirements: Requirement[];
};

/**
 * Feats live in one merged list whether they were picked, granted by a klass
 * level, or virtually possessed via a `set feats.<slug>.possessed = true`
 * modifier. Virtual entries carry `virtual: true` and use empty-string keys
 * for klass/character/aptitude IDs so existing per-level lookups (which key
 * by characterLevelId) skip them naturally without a flag check.
 */
export type FeatWithPMR = Feat & {
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  klassLevelFeatId?: string;
  virtual?: boolean;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

export type SkillWithRank = Skill & {
  klassLevelId: string;
  characterLevelId: string;
  rank: number;
};

/**
 * Same shape rule as FeatWithPMR. `virtual: true` powers are spells granted
 * by `set powers.<slug>.<apt>.known = true` modifiers; their klass/character
 * level IDs are empty strings so per-level scans skip them. Pool accounting
 * relies on `virtual` (or `free`, for klass-granted powers).
 */
export type PowerWithPMR = Power & {
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

export type InventoryEntry = CharacterInventory & {
  item: Item & {
    properties: Property[];
    modifiers: Modifier[];
    requirements: Requirement[];
  };
};

// ── Data loader result types ───────────────────────────────────────

/** Base result of character data loading. Rulesets extend with specific fields. */
export interface LoadedCharacterData {
  ruleset: Ruleset | undefined;
  player: Player | undefined;
  campaign: Campaign | undefined;
  rulesetAbilities: RulesetAbility[];
  rulesetSaves: RulesetSave[];
  rulesetSkills: Skill[];
  rulesetFeats: Feat[];
  rulesetPowers: PowerWithAptitudes[];
  rulesetPowerProperties: Property[];
  rulesetAptitudes: Aptitude[];
  rulesetKlasses: Klass[];
  leveledAptitudeIds: Set<string>;
  characterAbilityScores: { abilityId: string; name: string; score: number }[];
  race: RaceWithPMR;
  languages: Language[];
  inventory: InventoryEntry[];
  characterLevels: CharacterLevel[];
  klassLevels: KlassLevelWithPMR[];
  klassSkills: KlassSkill[];
  klassLevelSaves: KlassLevelSave[];
  klasses: Klass[];
  feats: FeatWithPMR[];
  skills: SkillWithRank[];
  powers: PowerWithPMR[];
  klassLevelFeatCountsByAptitudeId: Record<string, number>;
  klassLevelPowerCountsByAptitudeId: Record<string, number>;
  modifiers: Modifier[];
  requirementGroups: Requirement[][];
  validRulesetIds: Set<string>;
}

/**
 * Shared character data from rounds 1-3 of fetchCharacterData.
 * Returned by `detailedCharacter.preload()` and accepted by `build()` to avoid
 * duplicate DB queries when building the same character with different projections.
 */
export interface PreloadedCharacterData extends PreloadedRulesetData {
  /** Opaque bag of shared DB results — only consumed by DetailedCharacter.build() */
  _shared: unknown;
}

// Base type for all character component holders (abilities, skills, combat, etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Holder = Record<string, any>;

export type Holders = Record<string, Holder>;

export type TraversePathResult = {
  holder: Holder | null;
  object: unknown;
  data: unknown;
  key: string;
  resolvedPath: string | null;
  error: string | null;
};

export interface TargetPathsTraverser {
  traversePathInit(target: string, holders: Holders, context?: { sourceId?: string }): TraversePathResult[];
}

export type RequirementIssue = {
  category: "requirements";
  message: string;
  entityName?: string;
  entityType?: string;
  requirementTree?: string;
};

export type ProjectedFeat = Feat & {
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  klassLevelFeatId?: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

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

export interface DetailedCharacterInterface {
  preload(): Promise<PreloadedCharacterData>;
  build(database?: Db, projectedData?: unknown, preloaded?: PreloadedCharacterData | PreloadedRulesetData): Promise<void>;
  validate(): ValidationResult;
  formatRequirements(requirements: Requirement[]): string;
  areRequirementsMet(requirementGroups: Requirement[][]): boolean;
  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[];
  getRuleset(): Ruleset | undefined;
  getPlayer(): Player | undefined;
  getCampaign(): Campaign | undefined;
  getDetailedCharacterAbilities(): DetailedCharacterAbilities;
  getDetailedCharacterAptitudes(): DetailedCharacterAptitudes;
  getDetailedCharacterIdentity(): DetailedCharacterIdentity;
  getVirtuallyPossessedFeatIds(): string[];
  getVirtuallyPossessedPowerIds(): string[];
}

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

export interface TargetPathsInterface extends TargetPathsTraverser {
  getTargetPathsAndLabels(rulesetData: CachedRulesetData, kind: "modifier" | "requirement"): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }>;
  getCategories(): string[];
  getCategoryDescriptions(): Record<string, string>;
  getPathDescriptions(): Record<string, string>;
  getGroupDescriptionTemplates(): Record<string, string>;
}

export interface PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: EntityType): Record<string, string>;
  getStaticPropertyValues(type: string): string[] | null;
}

export type DetailedCharacterWithSheet = {
  detailedCharacter: DetailedCharacterInterface;
  CharacterSheetComponent: FC<{
    detailedCharacter: DetailedCharacterInterface;
    kind?: CharacterKind;
    portraitUrl?: string | null;
  }>;
};

export const CHARACTER_KINDS_DND35 = ["pc", "familiar", "animalcompanion", "mount"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS_DND35)[number];

export interface RulesetModule {
  hooks: ServiceHooks;
  seedRuleset(tx: Db, rulesetId: string): Promise<void>;
  seedTemplateItems(tx: Db, rulesetId: string): Promise<void>;
  remapRulesetProperties(tx: Db, sourceProperties: Property[], newRulesetId: string, idMaps: Record<string, Record<string, string>>): Promise<void>;
  createDetailedCharacter(record: CharacterRecord, kind?: CharacterKind): DetailedCharacterInterface;
  createLevelUpProjector(character: DetailedCharacterInterface): LevelUpProjector;
  createDetailedCharacterWithSheet(record: CharacterRecord, kind?: CharacterKind): Promise<DetailedCharacterWithSheet>;
  createTargetPaths(): TargetPathsInterface;
  createPropertyTypes(): PropertyTypesProvider;
}
