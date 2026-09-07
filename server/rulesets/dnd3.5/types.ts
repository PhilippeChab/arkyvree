/**
 * D&D 3.5-specific type extensions layered on top of the generic ruleset types.
 *
 * The generic `ProjectedCharacterData` and `LevelUpProjector` in
 * `server/rulesets/types.ts` only carry concepts that apply to every
 * level-based system. Anything 3.5-specific — skill ranks, spell levels,
 * Fort/Ref/Will save names, skill-points-per-level, wizard-prohibited
 * schools, class-skill distinction — lives here so other rulesets don't
 * inherit a dialect that doesn't apply to them.
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { Db } from "@/server/database/index.ts";
import type { Power, Skill } from "@/shared/relations.ts";
import type { LevelUpProjector, ProjectedCharacterData } from "@/server/rulesets/types.ts";

/** A projected skill row with a 3.5 rank allocation. */
export type Dnd35ProjectedSkill = Skill & {
  klassLevelId: string;
  characterLevelId: string;
  rank: number;
};

/** A projected power row with 3.5 spell-level and save-name fields. */
export type Dnd35ProjectedPower = Power & {
  klassLevelId: string;
  characterLevelId: string;
  aptitudeId: string;
  powerLevel: number | null;
  saveName: string | null;
};

/** 3.5 projected character data — extends the generic shape with 3.5 skill/power rows. */
export interface Dnd35ProjectedCharacterData extends ProjectedCharacterData {
  skills?: Dnd35ProjectedSkill[];
  powers?: Dnd35ProjectedPower[];
}

/** 3.5 level-up projector — generic surface + 3.5 skill-points / schools / ranks. */
export interface Dnd35LevelUpProjector extends LevelUpProjector {
  /** Per-klass-level skill points including INT mod, first-level x4 included. */
  computeSkillPointsPerLevel(
    klassLevelIds: string[],
    existingLevelCount: number,
    rulesetData: CachedRulesetData,
  ): Promise<{ perLevel: number[]; abilityMod: number }>;
  /** Wizard specialist-school exclusions + client-supplied prohibited schools.
   *  Must be called inside a cowContext so stored pre-COW feat ids on the
   *  repo reads inside come back post-COW. */
  getExcludedPowerIds(
    tx: Db,
    aptitudeId: string,
    characterLevelIds: string[],
    klassLevelIds: string[],
    selectedFeatProperties: { type: string; value: string }[],
    clientExcludeSchools: string[],
    rulesetData: CachedRulesetData,
  ): Promise<string[]>;
  /** 3.5 skill-points budget — a 3.5-native concept (skill points per level
   *  × INT mod, doubled at first level), not universal. */
  getSkillBudget(): { total: number; available: number; spent: number; perlevel: number };
  /** Keyed-by-name 3.5 skill data (rank, innate/class-skill flags). */
  getCharacterSkills(): Record<string, unknown>;
  /** Enriches a skill list with class-skill flags and current rank — 3.5 skill ranks. */
  getCharacterEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { isClassSkill: boolean; isCurrentClassSkill: boolean; currentRank: number })[];
}
