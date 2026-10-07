import type {
  Components,
  LevelUpProjector,
  PropertyTypesProvider,
  RequirementIssue,
  RulesetView,
  TargetPathsInterface,
  ValidationResult,
} from "@/engine/core/types.ts";
import type {
  CharacterAbilities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import type {
  Campaign,
  CharacterLevel,
  Character as CharacterRecord,
  Modifier,
  Player,
  Requirement,
  Ruleset,
} from "@/shared/relations.ts";

import type { ModuleEffects, ModuleRules } from "./module/index.ts";

/**
 * A character's own rows, which the server reads (`server/builds/`) and its module builds the character from: its seat
 * in a campaign, its ability scores, languages, inventory and levels, every saved level's picks (the links, whose
 * entities are the view's), and the modifiers set on the character itself, with their requirements. Read in its
 * ruleset's scope, their references are the view's ids.
 */
export interface CharacterRows {
  abilities: Awaited<ReturnType<typeof CharacterAbilities.findMany>>;
  campaign: Campaign | undefined;
  inventory: Awaited<ReturnType<typeof CharacterInventory.findMany>>;
  languages: Awaited<ReturnType<typeof CharacterLanguages.findMany>>;
  levels: CharacterLevel[];
  modifiers: Modifier[];
  picks: {
    feats: Awaited<ReturnType<typeof CharacterLevelFeats.findMany>>;
    powers: Awaited<ReturnType<typeof CharacterLevelPowers.findMany>>;
    skills: Awaited<ReturnType<typeof CharacterLevelSkills.findMany>>;
  };
  player: Player | undefined;
  requirements: Requirement[];
}

export interface DetailedCharacterInterface {
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean;
  /**
   * Builds the character from its rows (`rows`), in its ruleset's `view`, with a level-up's `projectedData`: a bonded
   * creature's `master` built first. A build reads nothing: the server reads what it's given (`buildCharacter`).
   */
  build(
    rows: CharacterRows,
    view: RulesetView,
    projectedData?: unknown,
    master?: DetailedCharacterInterface,
  ): Promise<void>;
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
