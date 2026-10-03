/**
 * Level-up preview query.
 *
 * - getLevelUpPreview — computes merged pools, per-level skill points, and slot distributions for the level-up wizard
 */

import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterLevels } from "@/server/repositories/index.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/helpers.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type { Session } from "@/shared/relations.ts";

import { computePerLevelAptitudeSlots } from "./distribution.ts";
import {
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  loadFeatCustomizations,
  plannedClassSkills,
} from "./helpers.ts";

export async function getLevelUpPreview(
  session: Session,
  characterId: string,
  levels: Array<{ klassId: string; level: number }>,
  abilityIds: (string | null)[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);

    // Resolve all klass levels and validate they belong to the character's ruleset.
    // `klassesById`/`klassLevelByKlassAndLevel` compose from the fork chain,
    // so a cache hit is proof of lineage (same semantics as rulesetIds.has).
    const klassLevelEntries = levels.map(({ klassId, level }, i) => {
      const klass = rulesetData.klassesById.get(klassId);
      if (!klass) {
        throw new BadRequestError(`Level ${i + 1}: Class does not belong to the character's ruleset`);
      }
      if (klass.kind !== "pc") {
        throw new BadRequestError(`Level ${i + 1}: Class is not valid for a player character`);
      }
      const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
      if (!klassLevel) {
        throw new NotFoundError(`Level ${i + 1}: Class level not found`);
      }
      return { klass, klassLevel, abilityId: abilityIds[i] ?? null };
    });

    // Build projected character levels for all planned levels
    const projectedCharacterLevels = klassLevelEntries.map(({ klassLevel, abilityId }) =>
      buildProjectedCharacterLevel(characterId, klassLevel.id, abilityId),
    );

    // Fetch auto-granted feats for all planned klass levels from the composed cache.
    const allAutoGrantedFeatRecords = klassLevelEntries.map(
      ({ klassLevel }) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
    );
    const flatAutoGrantedFeats = allAutoGrantedFeatRecords.flat();
    const autoGrantedFeatCustomizations = loadFeatCustomizations(
      rulesetData,
      flatAutoGrantedFeats.map((rec) => rec.featsInRule.id),
    );

    // Build projected data with all planned levels
    const projectedData: Dnd35ProjectedCharacterData = {
      characterLevels: projectedCharacterLevels,
      givenFeats: allAutoGrantedFeatRecords.flatMap((records, i) =>
        buildProjectedGivenFeats(records, projectedCharacterLevels[i].id, autoGrantedFeatCustomizations),
      ),
    };

    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);
    const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;

    // ── Extract merged feat pools (non-leveled aptitudes) ──
    const aptitudesInstance = detailedCharacter.getDetailedCharacterAptitudes();

    const powerPools = aptitudesInstance.extractPowerPools();
    const nonLeveledAptitudeIds = aptitudesInstance.getNonLeveledAptitudeIds();

    // Determine which non-leveled aptitudes are shared (used by both feats and powers)
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
      const isShared = sharedAptitudeIds.has(aptId);
      if (isShared) {
        // Shared aptitudes contribute to both — show in both pools
        featPools[aptId] = { ...pool, shared: true };
        powersToSelect += pool.available;
      } else {
        // Non-shared non-leveled → feat-only, remove from power pools
        featPools[aptId] = { ...pool, shared: false };
        delete powerPools[aptId];
        featsToSelect += pool.available;
      }
    }

    // ── Extract merged skills data ──
    const skillsBreakdown = levelUpProjector.getSkillBudget();

    const allSkills = rulesetData.skills;
    const classSkills = plannedClassSkills(
      rulesetData,
      klassLevelEntries.map(({ klass }) => klass.id),
    );
    const skillsWithClassInfo = levelUpProjector.getCharacterEnrichedSkills(allSkills, classSkills.merged);

    // ── Ability increases ──
    const existingLevels = await CharacterLevels.findMany(db, { characterId });
    const abilityIncreaseLevels: number[] = [];
    for (let i = 0; i < levels.length; i++) {
      if (rulesetModule.hooks.levels.isAbilityIncreaseLevel(existingLevels.length + i)) {
        abilityIncreaseLevels.push(i);
      }
    }

    const abilities = detailedCharacter.getDetailedCharacterAbilities();

    // ── Auto-granted feats ──
    const autoGrantedFeats = flatAutoGrantedFeats.map((rec) => rec.featsInRule);

    // ── Auto-granted powers (from composed cache) ──
    const allAutoGrantedPowerRecords = klassLevelEntries.map(
      ({ klassLevel }) => rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [],
    );
    const autoGrantedPowers = allAutoGrantedPowerRecords.flat().map((rec) => ({
      ...rec.powersInRule,
      free: rec.free,
    }));

    // ── Per-level skill points ──
    const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
    const { perLevel: perLevelSkillPoints } = await levelUpProjector.computeSkillPointsPerLevel(
      klassLevelIds,
      existingLevels.length,
      rulesetData,
    );

    // ── Per-level aptitude slots for auto-assignment ──
    // Build baseline character (without planned levels) to capture existing spent
    const preloaded = await detailedCharacter.preload();
    const baselineCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await baselineCharacter.build(db, undefined, preloaded);
    const baselineApts = baselineCharacter.getDetailedCharacterAptitudes().getAptitudes();

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
      // Skills step
      skills: {
        skillPointsToSpend: Math.max(1, skillsBreakdown.available),
        totalCharacterLevel: existingLevels.length + levels.length,
        skills: skillsWithClassInfo,
      },
      // Feats step
      feats: {
        featsToSelect,
        autoGrantedFeats,
        aptitudePools: featPools,
      },
      // Powers step
      powers: {
        powersToSelect,
        autoGrantedPowers,
        aptitudePools: powerPools,
      },
      // Attributes step
      attributes: {
        abilityIncreaseLevels,
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
