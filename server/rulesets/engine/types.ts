import type {
  Components,
  LevelUpProjector,
  PreloadedCharacterData,
  PropertyTypesProvider,
  RequirementIssue,
  TargetPathsInterface,
  ValidationResult,
} from "@/engine/core/types.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type { Campaign, Character as CharacterRecord, Player, Requirement, Ruleset } from "@/shared/relations.ts";

import type { ModuleEffects, ModuleRules } from "./module/index.ts";

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
  /** The feats the character holds that don't stack: picked, granted, planned or from its modifiers. */
  getHeldNonStackableFeatIds(): string[];
  /** The powers the character knows in a pool: picked, granted, planned or from its modifiers. */
  getKnownPowerIds(aptitudeId: string): string[];
  getPlayer(): Player | undefined;
  getRuleset(): Ruleset | undefined;
  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[];
  getVirtuallyPossessedPowerIds(): string[];
  /** The character's rows its builds share, read through `database`, in `scope` when it's the character's ruleset's. */
  preload(database?: Db, scope?: RulesetScope): Promise<PreloadedCharacterData>;
  validate(): ValidationResult;
}

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
  createLevelUpProjector(character: Character): Projector;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPathsInterface;
  /** What the ruleset does in a service's transaction */
  effects: ModuleEffects;
  /** What the ruleset answers the services, without the database */
  rules: ModuleRules;
}
