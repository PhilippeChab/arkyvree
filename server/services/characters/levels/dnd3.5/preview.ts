/**
 * Level-up preview query.
 *
 * - getLevelUpPreview — computes merged pools, per-level skill points, and slot distributions for the level-up wizard
 */

import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevels,
  Characters,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type { Session } from "@/shared/relations.ts";
import { buildProjectedCharacterLevel, buildProjectedGivenFeats, loadFeatCustomizations } from "./helpers.ts";
import { computePerLevelAptitudeSlots } from "./distribution.ts";

export async function getLevelUpPreview(
  session: Session,
  characterId: string,
  levels: Array<{ klassId: string; level: number }>,
  abilityIds: (string | null)[],
) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

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
  const allAutoGrantedFeatRecords = klassLevelEntries.map(({ klassLevel }) =>
    rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
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

  // Get class skills merged across all planned classes (from composed cache).
  const allKlassIds = [...new Set(levels.map((l) => l.klassId))];
  const allKlassSkillRecords = allKlassIds.map(
    (klassId) => rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [],
  );
  const mergedClassSkillIds = new Set(allKlassSkillRecords.flat().map((ks) => ks.skillId));
  const mergedClassSkillNames = new Set(allKlassSkillRecords.flat().map((ks) => ks.skillsInRule.name));

  const allSkills = rulesetData.skills;

  // Also mark subtypes of class skills as merged class skills
  for (const skill of allSkills) {
    if (
      !mergedClassSkillIds.has(skill.id) &&
      [...mergedClassSkillNames].some((name) => skill.name.startsWith(`${name} (`))
    ) {
      mergedClassSkillIds.add(skill.id);
    }
  }

  const skillsWithClassInfo = levelUpProjector.getCharacterEnrichedSkills(allSkills, mergedClassSkillIds);

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
  const allAutoGrantedPowerRecords = klassLevelEntries.map(({ klassLevel }) =>
    rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [],
  );
  const autoGrantedPowers = allAutoGrantedPowerRecords.flat().map((rec) => ({
    ...rec.powersInRule,
    free: rec.free,
  }));

  // ── Per-level skill points ──
  const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
  const { perLevel: perLevelSkillPoints } = await levelUpProjector.computeSkillPointsPerLevel(
    klassLevelIds, existingLevels.length, rulesetData,
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

  // ── Per-level class skill IDs for cross-class cost tracking ──
  const perLevelClassSkillIds: string[][] = [];
  for (const { klass } of klassLevelEntries) {
    const klassSkillRecords = allKlassSkillRecords.find((records) =>
      records.length > 0 && records[0].klassId === klass.id,
    ) ?? [];
    const klassSkillIds = new Set(klassSkillRecords.map((ks) => ks.skillId));
    // Also include subtypes
    const klassSkillNames = new Set(klassSkillRecords.map((ks) => ks.skillsInRule.name));
    const levelClassSkillIds = allSkills
      .filter((s) => klassSkillIds.has(s.id) || [...klassSkillNames].some((name) => s.name.startsWith(`${name} (`)))
      .map((s) => s.id);
    perLevelClassSkillIds.push(levelClassSkillIds);
  }

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
    perLevelClassSkillIds,
    perLevelFeatSlots,
    perLevelPowerSlots,
  };
  });
}
