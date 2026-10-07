/**
 * D&D 3.5-specific type extensions layered on top of the generic ruleset types.
 *
 * Everything the 3.5 character is built from and projected with — skill ranks, spell levels,
 * Fort/Ref/Will save names, skill-points-per-level, wizard-prohibited
 * schools, class-skill distinction — lives here so other rulesets don't
 * inherit a dialect that doesn't apply to them.
 */

import type { RulesetModule } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
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

import type DetailedCharacter from "./character/DetailedCharacter.ts";
import type { Dnd35Characters } from "./character/Dnd35Characters.ts";
import type { Dnd35Content } from "./content/Dnd35Content.ts";
import type { Dnd35Entities } from "./Dnd35Entities.ts";
import type { Dnd35LevelUp } from "./levelUp/Dnd35LevelUp.ts";

/** A projected power row with 3.5 spell-level and save-name fields. */
type Dnd35ProjectedPower = Power & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelId: string;
  powerLevel: number | null;
  saveName: string | null;
};

/** A projected skill row with a 3.5 rank allocation. */
type Dnd35ProjectedSkill = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

type ProjectedFeat = Feat & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelFeatId?: string;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

/** What a 3.5 character is: a player character, or a creature bonded to one. */
export type CharacterKind = "pc" | BondedKind;

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

/** 3.5 level-up projector — generic surface + 3.5 skill-points / schools / ranks. */
export interface Dnd35LevelUpProjector {
  /** Each planned level's points per level before the minimum, in the batch's order (class + ability modifier). */
  computeSkillPointBasesPerLevel(klassLevelIds: string[], rulesetData: RulesetData): number[];
  /** Each klass level's skill points, the skill point ability's modifier included, four times over at the first level. */
  computeSkillPointsPerLevel(klassLevelIds: string[], existingLevelCount: number, rulesetData: RulesetData): number[];
  /** Whether each candidate class level's requirements are met by the character with the planned levels too. */
  evaluateClassAvailability(
    candidates: { klassLevel: KlassLevel; klassName: string; requirementGroups: Requirement[][] }[],
    projectedCharacterLevel: ProjectedCharacterLevel,
  ): Map<string, boolean>;
  /** Enriches a skill list with class-skill flags and current rank — 3.5 skill ranks. */
  getCharacterEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { currentRank: number; isClassSkill: boolean; isCurrentClassSkill: boolean })[];
  /** Keyed-by-name 3.5 skill data (rank, innate/class-skill flags). */
  getCharacterSkills(): Record<string, unknown>;
  /**
   * The wizard spells of the schools the character's feats prohibit, and of those the client names; none for another
   * pool.
   */
  getExcludedPowerIds(aptitudeId: string, clientExcludeSchools: string[], rulesetData: RulesetData): string[];
  /** 3.5 skill-points budget — a 3.5-native concept (skill points per level
   *  × INT mod, doubled at first level), not universal. */
  getSkillBudget(): { available: number; perlevel: number; spent: number; total: number };
  /** Every level's points per level before the minimum, in the budget's order, and the bonus each adds. */
  getSkillPointBases(): { bonusPerLevel: number; pointsPerLevel: number[] };
}

/** 3.5 projected character data — extends the generic shape with 3.5 skill/power rows. */
export interface Dnd35ProjectedCharacterData extends ProjectedCharacterData {
  powers?: Dnd35ProjectedPower[];
  skills?: Dnd35ProjectedSkill[];
}

/** The 3.5 rules' module: its characters and kinds of character, and its parts, by their own types. */
export interface Dnd35RulesetModule extends RulesetModule<DetailedCharacter, CharacterKind> {
  characters: Dnd35Characters;
  content: Dnd35Content;
  entities: Dnd35Entities;
  levelUp: Dnd35LevelUp;
}

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

export type SkillWithRank = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};
