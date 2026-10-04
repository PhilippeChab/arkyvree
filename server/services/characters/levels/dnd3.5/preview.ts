/**
 * Level-up preview query.
 *
 * - getLevelUpPreview — computes merged pools, per-level skill points, and slot distributions for the level-up wizard
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels } from "@/server/repositories/index.ts";
import type { Dnd35LevelUpProjector } from "@/server/rulesets/dnd3.5/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { RulesetModule } from "@/server/rulesets/types.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

import { getPlannedClassSkills, getPlannedKlassLevels } from "./classes.ts";
import { computePerLevelAptitudeSlots } from "./distribution.ts";
import { buildBaselineAptitudes, projectPlannedLevels } from "./projection.ts";

type PowerPools = ReturnType<DetailedCharacterAptitudes["extractPowerPools"]>;

/**
 * The planned levels' pools and what's left to pick in them: an unleveled pool is a feat pool, and a power pool too
 * when it has powers (shared); a leveled one is a power pool.
 */
function splitPools(aptitudesInstance: DetailedCharacterAptitudes, rulesetData: CachedRulesetData) {
  const powerPools: PowerPools = aptitudesInstance.extractPowerPools();
  const nonLeveledAptitudeIds = aptitudesInstance.getNonLeveledAptitudeIds();
  const sharedAptitudeIds = new Set(
    nonLeveledAptitudeIds.filter((id) => rulesetData.aptitudeIdsByHavingPowers.has(id)),
  );

  const featPools: Record<
    string,
    { id: string; name: string; allowed: number; spent: number; available: number; shared: boolean }
  > = {};
  let featsToSelect = 0;
  let powersToSelect = 0;
  for (const aptId of nonLeveledAptitudeIds) {
    const pool = powerPools[aptId];
    if (sharedAptitudeIds.has(aptId)) {
      featPools[aptId] = { ...pool, shared: true };
      powersToSelect += pool.available;
    } else {
      featPools[aptId] = { ...pool, shared: false };
      delete powerPools[aptId];
      featsToSelect += pool.available;
    }
  }
  return { featPools, powerPools, featsToSelect, powersToSelect };
}

/** The planned levels (by index) that take an ability increase, after the character's `existingCount` levels. */
function abilityIncreaseLevels(rulesetModule: RulesetModule, existingCount: number, plannedCount: number) {
  const levels: number[] = [];
  for (let i = 0; i < plannedCount; i++) {
    if (rulesetModule.hooks.levels.isAbilityIncreaseLevel(existingCount + i)) {
      levels.push(i);
    }
  }
  return levels;
}

/** The powers the planned class levels grant, each saying whether it's free. */
function autoGrantedPowers(rulesetData: CachedRulesetData, klassLevelIds: string[]) {
  return klassLevelIds
    .flatMap((klassLevelId) => rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? [])
    .map((rec) => ({ ...rec.powersInRule, free: rec.free }));
}

export async function getLevelUpPreview(
  session: Session,
  characterId: string,
  levels: Array<{ klassId: string; level: number }>,
  abilityIds: (string | null)[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const klassLevelEntries = getPlannedKlassLevels(
      rulesetData,
      levels.map((level, i) => ({ ...level, abilityId: abilityIds[i] ?? null })),
    );
    const { projectedData, allAutoGrantedFeatRecords } = projectPlannedLevels(
      characterId,
      klassLevelEntries,
      rulesetData,
    );

    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);
    const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;
    const { featPools, powerPools, featsToSelect, powersToSelect } = splitPools(
      detailedCharacter.getDetailedCharacterAptitudes(),
      rulesetData,
    );

    // ── Extract merged skills data ──
    const skillsBreakdown = levelUpProjector.getSkillBudget();

    const allSkills = rulesetData.skills;
    const classSkills = getPlannedClassSkills(
      rulesetData,
      klassLevelEntries.map(({ klass }) => klass.id),
    );
    const skillsWithClassInfo = levelUpProjector.getCharacterEnrichedSkills(allSkills, classSkills.merged);

    const existingLevels = await CharacterLevels.findMany(db, { characterId });
    const abilities = detailedCharacter.getDetailedCharacterAbilities();
    const autoGrantedFeats = allAutoGrantedFeatRecords.flat().map((rec) => rec.featsInRule);

    // ── Per-level skill points ──
    const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
    const perLevelSkillPoints = await levelUpProjector.computeSkillPointsPerLevel(
      klassLevelIds,
      existingLevels.length,
      rulesetData,
    );

    // ── Per-level aptitude slots for auto-assignment ──
    // Build baseline character (without planned levels) to capture existing spent
    const baselineApts = await buildBaselineAptitudes(db, rulesetModule, characterRecord, detailedCharacter);

    const { perLevelFeatSlots, perLevelPowerSlots } = computePerLevelAptitudeSlots(
      rulesetData,
      klassLevelIds,
      allAutoGrantedFeatRecords,
      Object.keys(featPools),
      Object.keys(powerPools),
      existingLevels.length,
      baselineApts,
    );

    // ── Build level details ──
    const levelDetails = klassLevelEntries.map(({ klass, klassLevel }, i) => ({
      klassId: klass.id,
      klassName: klass.name,
      klassLevelId: klassLevel.id,
      level: klassLevel.level,
      hd: klass.hd,
      skillPoints: perLevelSkillPoints[i],
    }));

    return {
      skills: {
        skillPointsToSpend: Math.max(1, skillsBreakdown.available),
        totalCharacterLevel: existingLevels.length + levels.length,
        skills: skillsWithClassInfo,
      },
      feats: {
        featsToSelect,
        autoGrantedFeats,
        aptitudePools: featPools,
      },
      powers: {
        powersToSelect,
        autoGrantedPowers: autoGrantedPowers(rulesetData, klassLevelIds),
        aptitudePools: powerPools,
      },
      attributes: {
        abilityIncreaseLevels: abilityIncreaseLevels(rulesetModule, existingLevels.length, levels.length),
        attributes: abilities.getAbilitiesWithIds(),
      },
      // Per-level data for HP step, review, and auto-assignment
      levelDetails,
      perLevelSkillPoints,
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelPowerSlots,
    };
  });
}
