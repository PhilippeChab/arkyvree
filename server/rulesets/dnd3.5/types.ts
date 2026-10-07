/**
 * D&D 3.5-specific type extensions layered on top of the generic ruleset types.
 *
 * The generic `ProjectedCharacterData` and `LevelUpProjector` in
 * `server/rulesets/engine/types.ts` only carry concepts that apply to every
 * level-based system. Anything 3.5-specific — skill ranks, spell levels,
 * Fort/Ref/Will save names, skill-points-per-level, wizard-prohibited
 * schools, class-skill distinction — lives here so other rulesets don't
 * inherit a dialect that doesn't apply to them.
 */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type DetailedCharacter from "@/server/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type { LevelUpProjector, ProjectedCharacterData, RulesetModule } from "@/server/rulesets/engine/types.ts";
import type { BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Power, Property, Skill } from "@/shared/relations.ts";

/** A projected power row with 3.5 spell-level and save-name fields. */
type Dnd35ProjectedPower = Power & {
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  powerLevel: number | null;
  saveName: string | null;
};

/** A projected skill row with a 3.5 rank allocation. */
type Dnd35ProjectedSkill = Skill & {
  klassLevelId: string;
  characterLevelId: string;
  rank: number;
};

/** What a 3.5 character is: a player character, or a creature bonded to one. */
export type CharacterKind = "pc" | BondedKind;

/** 3.5 level-up projector — generic surface + 3.5 skill-points / schools / ranks. */
export interface Dnd35LevelUpProjector extends LevelUpProjector {
  /** Each planned level's points per level before the minimum, in the batch's order (class + ability modifier). */
  computeSkillPointBasesPerLevel(klassLevelIds: string[], rulesetData: RulesetData): number[];
  /** Each klass level's skill points, the skill point ability's modifier included, four times over at the first level. */
  computeSkillPointsPerLevel(
    klassLevelIds: string[],
    existingLevelCount: number,
    rulesetData: RulesetData,
  ): Promise<number[]>;
  /** Wizard specialist-school exclusions + client-supplied prohibited schools.
   *  Must be called inside a cowContext so stored pre-COW feat ids on the
   *  repo reads inside come back post-COW. */
  getExcludedPowerIds(
    tx: Db,
    aptitudeId: string,
    characterLevels: { id: string; klassLevelId: string }[],
    selectedFeatProperties: { type: string; value: string }[],
    clientExcludeSchools: string[],
    rulesetData: RulesetData,
  ): Promise<string[]>;
  /** 3.5 skill-points budget — a 3.5-native concept (skill points per level
   *  × INT mod, doubled at first level), not universal. */
  getSkillBudget(): { total: number; available: number; spent: number; perlevel: number };
  /** Every level's points per level before the minimum, in the budget's order, and the bonus each adds. */
  getSkillPointBases(): { pointsPerLevel: number[]; bonusPerLevel: number };
  /** Keyed-by-name 3.5 skill data (rank, innate/class-skill flags). */
  getCharacterSkills(): Record<string, unknown>;
  /** Enriches a skill list with class-skill flags and current rank — 3.5 skill ranks. */
  getCharacterEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { isClassSkill: boolean; isCurrentClassSkill: boolean; currentRank: number })[];
}

/** 3.5 projected character data — extends the generic shape with 3.5 skill/power rows. */
export interface Dnd35ProjectedCharacterData extends ProjectedCharacterData {
  skills?: Dnd35ProjectedSkill[];
  powers?: Dnd35ProjectedPower[];
}

/** The 3.5 rules' module: its characters, level-up projector and kinds of character, by their own types. */
export type Dnd35RulesetModule = RulesetModule<DetailedCharacter, Dnd35LevelUpProjector, CharacterKind>;

/** A property row a 3.5 effect writes for an entity: a skill's flags, a class level's base attack and skill points. */
export type PropertyRecord = {
  entityId: string;
  entityType: string;
  type: string;
  value: string;
};

/** What a weapon's stats read of a property: its type and its value (an item's, or a natural attack's). */
export type WeaponProperty = Pick<Property, "type" | "value">;
