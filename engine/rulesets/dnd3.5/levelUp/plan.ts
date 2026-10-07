import type { RulesetData } from "@/engine/core/view/index.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import Dnd35LevelUpProjector from "@/engine/rulesets/dnd3.5/character/Dnd35LevelUpProjector.ts";
import { Dnd35LevelsRules } from "@/engine/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";

import { getPlannedClassSkills, type getPlannedKlassLevels } from "./classes.ts";
import {
  buildPowerLevelLookup,
  buildSkillContexts,
  computePerLevelAptitudeSlots,
  distributePoolSelections,
  getDeferredAptitudeSources,
  type PerLevelDistributionData,
} from "./distribution.ts";
import type { projectPlannedLevels } from "./projection.ts";

/**
 * A level-up's planned levels, built: the character with them (`character`, built with `projectPlannedLevels`'s
 * projection), the character as saved, without them (`saved`), what their class levels grant, and how many levels it
 * has before them.
 */
export interface PlannedLevels {
  autoGrantedRecords: ReturnType<typeof projectPlannedLevels>["allAutoGrantedFeatRecords"];
  character: Dnd35DetailedCharacter;
  existingLevelCount: number;
  klassLevelEntries: ReturnType<typeof getPlannedKlassLevels>;
  saved: Dnd35DetailedCharacter;
}

/** What a save distributes its pooled picks over the planned levels by: each level's points, class skills and slots. */
function buildDistributionData(planned: PlannedLevels, rulesetData: RulesetData): PerLevelDistributionData {
  const { classSkills, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints, projector } = planLevelUp(
    planned,
    rulesetData,
  );
  return {
    perLevelSkillPoints,
    perLevelClassSkillIds: classSkills.perLevel,
    perLevelFeatSlots,
    perLevelPowerSlots,
    baseCharacterLevel: planned.existingLevelCount,
    skillContexts: buildSkillContexts(projector, rulesetData.skills, classSkills.merged),
  };
}

/** The planned levels (by index) that take an ability increase, after the character's `existingCount` levels. */
function getAbilityIncreaseLevels(existingCount: number, plannedCount: number) {
  const levels: number[] = [];
  for (let i = 0; i < plannedCount; i++) if (Dnd35LevelsRules.isAbilityIncreaseLevel(existingCount + i)) levels.push(i);
  return levels;
}

/** The powers the planned class levels grant, each saying whether it's free. */
function getAutoGrantedPowers(rulesetData: RulesetData, klassLevelIds: string[]) {
  return klassLevelIds
    .flatMap((klassLevelId) => rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? [])
    .map((rec) => ({ ...rec.powersInRule, free: rec.free }));
}

/**
 * What the planned levels give, the same for the preview and the save: the pools the character picks in, each
 * level's skill points, class skills and pool slots, and the projector the skills are read through.
 */
function planLevelUp(planned: PlannedLevels, rulesetData: RulesetData) {
  const { autoGrantedRecords, character, existingLevelCount, klassLevelEntries, saved } = planned;
  const projector = new Dnd35LevelUpProjector(character);
  const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
  const pools = character.components.aptitudes.getLevelUpPools(rulesetData);
  const slots = computePerLevelAptitudeSlots(
    rulesetData,
    klassLevelIds,
    autoGrantedRecords,
    Object.keys(pools.featPools),
    Object.keys(pools.powerPools),
    existingLevelCount,
    saved.components.aptitudes.getAptitudes(),
  );
  return {
    ...slots,
    classSkills: getPlannedClassSkills(
      rulesetData,
      klassLevelEntries.map(({ klass }) => klass.id),
    ),
    klassLevelIds,
    perLevelSkillPoints: projector.computeSkillPointsPerLevel(klassLevelIds, existingLevelCount, rulesetData),
    pools,
    projector,
  };
}

/**
 * The level-up wizard's preview of the planned levels: its skills, feats, powers and attributes steps, each level's
 * class, hit die and skill points, and what it recomputes the points and auto-assigns the picks by. The skills step's
 * points before the minimum are the planned levels' in the batch's order, and every level's in the budget's.
 */
export function buildLevelUpPreview(planned: PlannedLevels, rulesetData: RulesetData) {
  const { autoGrantedRecords, character, existingLevelCount, klassLevelEntries } = planned;
  const { classSkills, klassLevelIds, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints, pools, projector } =
    planLevelUp(planned, rulesetData);
  return {
    skills: {
      skillPointsToSpend: Math.max(1, projector.getSkillBudget().available),
      totalCharacterLevel: existingLevelCount + klassLevelEntries.length,
      skills: projector.getCharacterEnrichedSkills(rulesetData.skills, classSkills.merged),
      ...projector.getSkillPointBases(),
    },
    feats: {
      featsToSelect: pools.featsToSelect,
      autoGrantedFeats: autoGrantedRecords.flat().map((rec) => rec.featsInRule),
      aptitudePools: pools.featPools,
    },
    powers: {
      powersToSelect: pools.powersToSelect,
      autoGrantedPowers: getAutoGrantedPowers(rulesetData, klassLevelIds),
      aptitudePools: pools.powerPools,
    },
    attributes: {
      abilityIncreaseLevels: getAbilityIncreaseLevels(existingLevelCount, klassLevelEntries.length),
      attributes: character.components.abilities.getAbilitiesWithIds(),
    },
    // Per-level data for HP step, review, and auto-assignment
    levelDetails: klassLevelEntries.map(({ klass, klassLevel }, i) => ({
      klassId: klass.id,
      klassName: klass.name,
      klassLevelId: klassLevel.id,
      level: klassLevel.level,
      hd: klass.hd,
      skillPoints: perLevelSkillPoints[i],
    })),
    perLevelSkillPoints,
    perLevelSkillPointBases: projector.computeSkillPointBasesPerLevel(klassLevelIds, rulesetData),
    perLevelClassSkillIds: classSkills.perLevel,
    perLevelFeatSlots,
    perLevelPowerSlots,
  };
}

/**
 * A save's pooled picks (skill ranks, and feats and powers by pool) spread over its planned levels, each level taking
 * what its points and slots allow, in order.
 */
export function distributePlannedPicks(
  planned: PlannedLevels,
  skills: Record<string, number>,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
  rulesetData: RulesetData,
) {
  const data = buildDistributionData(planned, rulesetData);
  return distributePoolSelections(
    data,
    skills,
    feats,
    powers,
    buildPowerLevelLookup(rulesetData, Object.values(powers).flat()),
    getDeferredAptitudeSources(rulesetData, feats, data.perLevelFeatSlots),
  );
}
