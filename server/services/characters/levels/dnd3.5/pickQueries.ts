/**
 * Entity browsing queries for level-up selection.
 *
 * - getAvailableKlasses — classes the character can take next, with eligibility
 * - getAvailableFeats — feats available for a given aptitude pool
 * - getAvailableFeatsGrouped — same as above, grouped by feat family
 * - getAvailablePowers — powers/spells available for a given aptitude pool
 * - getLevel — retrieves saved selections for an existing character level
 */

import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  Feats,
  Klasses,
  Powers,
} from "@/server/repositories/index.ts";
import type { KlassLevel, Requirement } from "@/shared/relations.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { DetailedCharacterInterface, PreloadedRulesetData } from "@/server/rulesets/types.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedFeatsFromPicks,
  buildProjectedGivenFeats,
  buildProjectedSkillsFromAllocations,
  loadFeatCustomizations,
  getLevelIdsFromOnward,
  type FeatPick,
} from "./helpers.ts";
import { annotateRequirements } from "./validation.ts";

/** Resolves aptitude-targeting modifiers (aptitudes.<slug>.allowed) for feats, grouped by feat ID. */
function resolveAptitudeModifiers(
  featIds: string[],
  rulesetData: CachedRulesetData,
) {
  const result = new Map<string, { aptitudeId: string; value: number; operator: string }[]>();
  if (featIds.length === 0) return result;

  for (const featId of featIds) {
    const mods = rulesetData.modifiersBySource.get(featId);
    if (!mods) continue;
    for (const mod of mods) {
      if (mod.sourceType !== "feats") continue;
      const match = mod.target.match(/^aptitudes\.([a-z0-9]+)\.allowed$/);
      if (!match) continue;
      const resolvedAptitudeId = rulesetData.aptitudeIdBySlug.get(match[1]);
      if (!resolvedAptitudeId) continue;

      let group = result.get(mod.sourceId);
      if (!group) { group = []; result.set(mod.sourceId, group); }
      group.push({ aptitudeId: resolvedAptitudeId, value: Number(mod.value), operator: mod.operator });
    }
  }

  return result;
}

/** Computes non-stackable feat IDs to exclude from browsing (existing, auto-granted, selected, virtual). */
async function getExcludeNonStackableFeatIds(
  database: typeof db,
  allCharacterLevels: { id: string; klassLevelId: string }[],
  excludeIdSet: Set<string>,
  autoGrantedRecords: Array<{ featsInRule: { id: string; stackable: boolean } }>,
  selectedNonStackableFeatIds: string[],
  detailedCharacter: DetailedCharacterInterface,
) {
  const characterLevels = excludeIdSet.size > 0
    ? allCharacterLevels.filter((l) => !excludeIdSet.has(l.id))
    : allCharacterLevels;
  const characterLevelIds = characterLevels.map((lvl) => lvl.id);
  const klassLevelIds = characterLevels.map((lvl) => lvl.klassLevelId);
  const pickedFeats = await Feats.findManyByCharacterLevelIds(database, { characterLevelIds });
  const givenFeats = await Feats.findManyByKlassLevelIds(database, { klassLevelIds, characterLevelIds });
  const excludeFeatIds = [...pickedFeats, ...givenFeats]
    .filter((feat) => !feat.stackable)
    .map((feat) => feat.id);

  for (const rec of autoGrantedRecords) {
    if (!rec.featsInRule.stackable) {
      excludeFeatIds.push(rec.featsInRule.id);
    }
  }

  excludeFeatIds.push(...selectedNonStackableFeatIds);

  const virtualFeatIds = detailedCharacter.getVirtuallyPossessedFeatIds();
  if (virtualFeatIds.length > 0) {
    const virtualFeats = await Feats.findMany(database, { ids: virtualFeatIds });
    for (const feat of virtualFeats) {
      if (!feat.stackable) {
        excludeFeatIds.push(feat.id);
      }
    }
  }

  return excludeFeatIds;
}

export async function getAvailablePowers(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { powerLevel?: number; search?: string; excludeSchools?: string[]; selectedFeatPicks?: FeatPick[]; pendingLevelFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }
  
    // Fetch auto-granted powers for the current klass level so they are part of the
    // projected character (for requirement checking) and excluded from selection.
    const autoGrantedPowerRecords =
      rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];
  
    const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
    const excludeIds = excludeCharacterLevelId
      ? getLevelIdsFromOnward(allCharacterLevels, excludeCharacterLevelId)
      : [];
    const excludeIdSet = new Set(excludeIds);
  
    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds)
      : [];
  
    const allSelectedFeatPicks: FeatPick[] = [
      ...(where.pendingLevelFeatPicks ?? []),
      ...(where.selectedFeatPicks ?? []),
    ];

    const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevel.id);
    const { projectedFeats: selectedProjectedFeats } = buildProjectedFeatsFromPicks(
      allSelectedFeatPicks, klassLevel.id, projectedCharacterLevel.id, rulesetData,
    );
    const projectedData: Dnd35ProjectedCharacterData = {
      ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
      characterLevels: [...pendingLevels, projectedCharacterLevel],
      ...(selectedProjectedFeats.length > 0 && { feats: selectedProjectedFeats }),
      powers: autoGrantedPowerRecords.map((rec) => ({
        ...rec.powersInRule,
        klassLevelId: klassLevel.id,
        characterLevelId: projectedCharacterLevel.id,
        aptitudeId: rec.aptitudeId,
        powerLevel: null,
        saveName: null,
      })),
    };
  
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);
  
    // Get character's existing powers to exclude already-taken ones
    // When editing, exclude the edited level and all subsequent levels from the "already taken" set
    const characterLevels = excludeIdSet.size > 0
      ? allCharacterLevels.filter((l) => !excludeIdSet.has(l.id))
      : allCharacterLevels;
    const characterLevelIds = characterLevels.map((lvl) => lvl.id);
    const klassLevelIds = characterLevels.map((lvl) => lvl.klassLevelId);
    const pickedPowers = await Powers.findManyByCharacterLevelIds(db, { characterLevelIds });
    const givenPowers = await Powers.findManyByKlassLevelIds(db, { klassLevelIds, characterLevelIds });
    const excludePowerIds = [...pickedPowers, ...givenPowers]
      .filter((power) => power.aptitudeId === aptitudeId)
      .map((power) => power.id);
  
    // Also exclude auto-granted powers from the current klass level
    for (const rec of autoGrantedPowerRecords) {
      excludePowerIds.push(rec.powersInRule.id);
    }
  
    // Exclude powers virtually granted by modifiers (e.g. "set powers.<spell>.<apt>.known = true")
    const virtualPowerIds = detailedCharacter.getVirtuallyPossessedPowerIds();
    excludePowerIds.push(...virtualPowerIds);
  
    // Exclude powers from wizard-prohibited schools (delegated to ruleset-specific projector)
    const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;
    const wizardExcluded = await levelUpProjector.getExcludedPowerIds(
      db, aptitudeId, characterLevelIds, klassLevelIds,
      selectedProjectedFeats.flatMap((f) => f.properties),
      where.excludeSchools ?? [],
      rulesetData,
    );
    excludePowerIds.push(...wizardExcluded);

    const result = await Powers.findAvailableByAptitude(
      db,
      {
        rulesetId: characterRecord.rulesetId, ancestorRulesetIds: rulesetData.cow.sourceChain, aptitudeId, excludePowerIds,
        siblingLoserIds: rulesetData.cow.siblingIds,
        powerLevel: where.powerLevel, search: where.search,
      },
      pagination,
    );
  
    const items = annotateRequirements(detailedCharacter, result.items, rulesetData);
    return { items, page: result.page, nextPage: result.nextPage };
  
  });
}

export async function getAvailableFeats(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { search?: string; family?: string; selectedFeatPicks?: FeatPick[]; pendingLevelFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

    // Fetch auto-granted feats for the current klass level AND all pending batch levels
    // from the composed cache — same join shape as KlassLevelFeats.findManyWithFeats.
    const allAutoGrantedKlassLevelIds = [...new Set([klassLevel.id, ...(pendingLevelKlassLevelIds ?? [])])];
    const allAutoGrantedRecords = allAutoGrantedKlassLevelIds.flatMap(
      (klid) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [],
    );
    const allAutoGrantedFeatCustomizations = loadFeatCustomizations(rulesetData, allAutoGrantedRecords.map((rec) => rec.featsInRule.id));

    const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
    const excludeIds = excludeCharacterLevelId
      ? getLevelIdsFromOnward(allCharacterLevels, excludeCharacterLevelId)
      : [];
    const excludeIdSet = new Set(excludeIds);

    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
      : [];

    const allSelectedFeatPicks: FeatPick[] = [
      ...(where.pendingLevelFeatPicks ?? []),
      ...(where.selectedFeatPicks ?? []),
    ];

    const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevel.id);
    const { projectedFeats: selectedProjectedFeats, nonStackableFeatIds: selectedNonStackable } =
      buildProjectedFeatsFromPicks(
        allSelectedFeatPicks, klassLevel.id, projectedCharacterLevel.id, rulesetData,
      );
    const projectedData: Dnd35ProjectedCharacterData = {
      ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
      characterLevels: [...pendingLevels, projectedCharacterLevel],
      ...(selectedProjectedFeats.length > 0 && { feats: selectedProjectedFeats }),
      givenFeats: buildProjectedGivenFeats(allAutoGrantedRecords, projectedCharacterLevel.id, allAutoGrantedFeatCustomizations),
    };

    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);

    const excludeFeatIds = await getExcludeNonStackableFeatIds(
      db, allCharacterLevels, excludeIdSet, allAutoGrantedRecords, selectedNonStackable, detailedCharacter,
    );

    const result = await Feats.findAvailableByAptitude(
      db,
      {
        rulesetId: characterRecord.rulesetId, ancestorRulesetIds: rulesetData.cow.sourceChain, aptitudeId, excludeFeatIds,
        siblingLoserIds: rulesetData.cow.siblingIds,
        family: where.family, search: where.search,
      },
      pagination,
    );

    const items = annotateRequirements(detailedCharacter, result.items, rulesetData);
    const aptitudeModByFeat = resolveAptitudeModifiers(items.map((f) => f.id), rulesetData);
    const itemsWithModifiers = items.map((item) => ({
      ...item,
      aptitudeModifiers: aptitudeModByFeat.get(item.id) ?? [],
    }));
  
    return { items: itemsWithModifiers, page: result.page, nextPage: result.nextPage };
  
  });
}

export async function getAvailableFeatsGrouped(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { search?: string; selectedFeatPicks?: FeatPick[]; pendingLevelFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

    // Fetch auto-granted feats for the current klass level AND all pending batch levels
    // in a single query. All feats are projected into the character build (for requirement
    // evaluation, e.g. weapon proficiency needed for Weapon Focus) and excluded from selection.
    const allAutoGrantedKlassLevelIds = [...new Set([klassLevel.id, ...(pendingLevelKlassLevelIds ?? [])])];
    const allAutoGrantedRecords = allAutoGrantedKlassLevelIds.flatMap(
      (klid) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [],
    );
    const allAutoGrantedFeatCustomizations = loadFeatCustomizations(rulesetData, allAutoGrantedRecords.map((rec) => rec.featsInRule.id));

    const allSelectedFeatPicks: FeatPick[] = [
      ...(where.pendingLevelFeatPicks ?? []),
      ...(where.selectedFeatPicks ?? []),
    ];

    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
      : [];

    const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevel.id);
    const { projectedFeats: selectedProjectedFeats, nonStackableFeatIds: selectedNonStackable } =
      buildProjectedFeatsFromPicks(
        allSelectedFeatPicks, klassLevel.id, projectedCharacterLevel.id, rulesetData,
      );

    const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
    const excludeIds = excludeCharacterLevelId
      ? getLevelIdsFromOnward(allCharacterLevels, excludeCharacterLevelId)
      : [];
    const excludeIdSet = new Set(excludeIds);

    const projectedData: Dnd35ProjectedCharacterData = {
      ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
      characterLevels: [...pendingLevels, projectedCharacterLevel],
      ...(selectedProjectedFeats.length > 0 && { feats: selectedProjectedFeats }),
      givenFeats: buildProjectedGivenFeats(allAutoGrantedRecords, projectedCharacterLevel.id, allAutoGrantedFeatCustomizations),
    };

    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);

    const excludeFeatIds = await getExcludeNonStackableFeatIds(
      db, allCharacterLevels, excludeIdSet, allAutoGrantedRecords, selectedNonStackable, detailedCharacter,
    );

    const result = await Feats.findAvailableByAptitudeGrouped(
      db,
      {
        rulesetId: characterRecord.rulesetId, ancestorRulesetIds: rulesetData.cow.sourceChain, aptitudeId, excludeFeatIds,
        siblingLoserIds: rulesetData.cow.siblingIds,
        search: where.search,
      },
      pagination,
    );
  
    // Annotate single-feat rows with eligibility + aptitude modifiers
    const singleRows = result.items.filter((r) => r.variantCount === 1);
    if (singleRows.length === 0) {
      const items = result.items.map((row) => ({ ...row, eligible: true as boolean, aptitudeModifiers: [] as { aptitudeId: string; value: number; operator: string }[] }));
      return { items, page: result.page, nextPage: result.nextPage };
    }
  
    const singleIds = singleRows.map((r) => ({ id: r.representativeId }));
    const annotated = annotateRequirements(detailedCharacter, singleIds, rulesetData);
    const eligibilityMap = new Map(annotated.map((a) => [a.id, a.eligible]));
    const requirementTreeMap = new Map(annotated.filter((a) => a.requirementTree).map((a) => [a.id, a.requirementTree!]));
  
    const aptitudeModByFeat = resolveAptitudeModifiers(singleRows.map((r) => r.representativeId), rulesetData);
  
    const items = result.items.map((row) => {
      if (row.variantCount === 1) {
        const eligible = eligibilityMap.get(row.representativeId) ?? true;
        return {
          ...row,
          eligible,
          aptitudeModifiers: aptitudeModByFeat.get(row.representativeId) ?? [],
          ...(!eligible ? { requirementTree: requirementTreeMap.get(row.representativeId) } : {}),
        };
      }
      return { ...row, eligible: true as boolean, aptitudeModifiers: [] as { aptitudeId: string; value: number; operator: string }[] };
    });
  
    return { items, page: result.page, nextPage: result.nextPage };
  
  });
}

export async function getAvailableKlasses(
  session: Session,
  characterId: string,
  where: { search?: string },
  pagination: { limit: number; page: number },
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
  pendingFeatPicks?: FeatPick[],
  pendingSkillAllocations?: { skillId: string; rank: number }[],
) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const { sourceChain } = rulesetData.cow;

    const klassPage = await Klasses.findManyByRulesetId(
      db,
      {
        rulesetId: characterRecord.rulesetId, ancestorRulesetIds: sourceChain, characterId,
        siblingLoserIds: rulesetData.cow.siblingIds,
        kind: "pc",
        search: where.search,
      },
      pagination,
    );

    if (klassPage.items.length === 0) {
      return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };
    }
  
    const characterKlassLevels = await CharacterLevels.findMaxKlassLevelsByCharacter(db, {
      characterId,
    });
    const characterKlassLevelMap = new Map(
      characterKlassLevels.map((i) => [i.klassId, i.maxLevel]),
    );
  
    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
      : [];
  
    // Next klass level per class (served from cache — no DB)
    const nextKlassLevelMap = new Map<string, KlassLevel>();
    if (rulesetData) {
      for (const klass of klassPage.items) {
        const nextLevel = (characterKlassLevelMap.get(klass.id) || 0) + 1;
        const kl = rulesetData.klassLevelByKlassAndLevel.get(`${klass.id}:${nextLevel}`);
        if (kl) nextKlassLevelMap.set(klass.id, kl);
      }
    }
  
    // Max level per class — pre-indexed on rulesetData.
    const maxLevelMap = rulesetData?.maxLevelByKlassId ?? new Map<string, number>();
  
    const klassesWithNextLevel = klassPage.items
      .filter((klass) => nextKlassLevelMap.has(klass.id))
      .map((klass) => ({ klass, nextKlassLevel: nextKlassLevelMap.get(klass.id)! }));
  
    if (klassesWithNextLevel.length === 0) {
      return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };
    }
  
    // Per-candidate requirements — served from the cache's requirementsByEntity map.
    const requirementsByKlassLevel = new Map<string, Requirement[]>();
    if (rulesetData) {
      for (const k of klassesWithNextLevel) {
        const reqs = rulesetData.requirementsByEntity.get(k.nextKlassLevel.id);
        if (reqs && reqs.length > 0) requirementsByKlassLevel.set(k.nextKlassLevel.id, reqs);
      }
    }
  
    // Candidates without requirements pass automatically
    const withoutRequirements = klassesWithNextLevel.filter(
      (k) => !requirementsByKlassLevel.has(k.nextKlassLevel.id),
    );
    const withRequirements = klassesWithNextLevel.filter(
      (k) => requirementsByKlassLevel.has(k.nextKlassLevel.id),
    );
  
    // For candidates with requirements, build the character once and evaluate via projector.
    const evaluationResultMap = new Map<string, boolean>();
    let detailedCharacter: DetailedCharacterInterface | undefined;
    if (withRequirements.length > 0) {
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  
      // Preload COW + ruleset data to avoid redundant fetches inside build()
      const preloadedRulesetData: CachedRulesetData = rulesetData;
      const preloaded: PreloadedRulesetData = { ruleset, cowData: rulesetData.cow, rulesetData: preloadedRulesetData };
      const skillAnchorLevel = pendingLevels[0] ?? buildProjectedCharacterLevel(characterId, "");
      const autoGrantedRecords = pendingLevelKlassLevelIds?.length && preloadedRulesetData
        ? pendingLevelKlassLevelIds.flatMap(
            (klid) => preloadedRulesetData!.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [],
          )
        : [];
      const { projectedFeats } = pendingFeatPicks?.length && preloadedRulesetData
        ? buildProjectedFeatsFromPicks(pendingFeatPicks, "", "", preloadedRulesetData)
        : { projectedFeats: [] as NonNullable<Dnd35ProjectedCharacterData["feats"]> };
      const projectedSkills = pendingSkillAllocations?.length && preloadedRulesetData
        ? buildProjectedSkillsFromAllocations(pendingSkillAllocations, skillAnchorLevel.klassLevelId, skillAnchorLevel.id, preloadedRulesetData)
        : [];
  
      // Project auto-granted feats (free/virtual) from pending klass levels
      // so they're visible during requirement evaluation (e.g., Monk L1 grants Improved Unarmed Strike).
      let projectedGivenFeats: Dnd35ProjectedCharacterData["givenFeats"] = [];
      if (autoGrantedRecords.length > 0 && preloadedRulesetData) {
        const autoGrantedCustomizations = loadFeatCustomizations(preloadedRulesetData, autoGrantedRecords.map((rec) => rec.featsInRule.id));
        projectedGivenFeats = buildProjectedGivenFeats(autoGrantedRecords, pendingLevels[0].id, autoGrantedCustomizations);
      }
  
      const hasProjections = pendingLevels.length > 0 || projectedFeats.length > 0 || projectedGivenFeats.length > 0 || projectedSkills.length > 0;
      const projectedData: Dnd35ProjectedCharacterData | undefined = hasProjections
        ? {
            ...(pendingLevels.length > 0 && { characterLevels: pendingLevels }),
            ...(projectedFeats.length > 0 && { feats: projectedFeats }),
            ...(projectedGivenFeats.length > 0 && { givenFeats: projectedGivenFeats }),
            ...(projectedSkills.length > 0 && { skills: projectedSkills }),
          }
        : undefined;
      await detailedCharacter.build(undefined, projectedData, preloaded);
  
      const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;
      const candidates = withRequirements.map((k) => ({
        klassName: stripSeparators(k.klass.name),
        klassLevel: k.nextKlassLevel,
        requirementGroups: [requirementsByKlassLevel.get(k.nextKlassLevel.id)!],
      }));
      const projectedCharLevel = buildProjectedCharacterLevel(characterId, "");
      const evaluationResults = await levelUpProjector.evaluateClassAvailability(candidates, projectedCharLevel);
      for (const [klassLevelId, result] of evaluationResults) {
        evaluationResultMap.set(klassLevelId, result);
      }
    }
  
    const items = [
      ...withoutRequirements.map((k) => ({ ...k.klass, nextLevel: k.nextKlassLevel.level, maxLevel: maxLevelMap.get(k.klass.id) ?? k.nextKlassLevel.level, eligible: true, requirementTree: undefined as string | undefined })),
      ...withRequirements.map((k) => {
        const eligible = evaluationResultMap.get(k.nextKlassLevel.id) ?? false;
        const reqs = requirementsByKlassLevel.get(k.nextKlassLevel.id);
        return {
          ...k.klass,
          nextLevel: k.nextKlassLevel.level,
          maxLevel: maxLevelMap.get(k.klass.id) ?? k.nextKlassLevel.level,
          eligible,
          requirementTree: !eligible && reqs && detailedCharacter ? detailedCharacter.formatRequirements(reqs) : undefined,
        };
      }),
    ].sort((a, b) => b.nextLevel - a.nextLevel || a.name.localeCompare(b.name));
  
    return { items, page: klassPage.page, nextPage: klassPage.nextPage };
  
  });
}

export async function getLevel(session: Session, characterId: string, characterLevelId: string) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  const characterLevel = await CharacterLevels.findOne(db, { id: characterLevelId });
  if (!characterLevel || characterLevel.characterId !== characterId) {
    throw new NotFoundError("Character level not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ rulesetData }) => {
    // Inside withRulesetScope every Character* repo read below returns rows
    // with *Id fields already remapped to post-COW, and rulesetData's id
    // Maps auto-resolve stored pre-COW keys. No manual canonicalize calls.
    const [refreshedCharacterLevel, levelSkills, levelFeats, levelPowers] = await Promise.all([
      // Re-fetch the character level inside the context so its klassLevelId /
      // abilityId come back post-COW.
      CharacterLevels.findOne(db, { id: characterLevelId }),
      CharacterLevelSkills.findMany(db, { characterLevelIds: [characterLevelId] }),
      CharacterLevelFeats.findMany(db, { characterLevelIds: [characterLevelId] }),
      CharacterLevelPowers.findMany(db, { characterLevelIds: [characterLevelId] }),
    ]);
    if (!refreshedCharacterLevel) {
      throw new NotFoundError("Character level not found");
    }
  
    const klassLevel = rulesetData.klassLevelsById.get(refreshedCharacterLevel.klassLevelId);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }
    const klass = rulesetData.klassesById.get(klassLevel.klassId);
    if (!klass) {
      throw new NotFoundError("Class not found");
    }
  
    const skills: Record<string, number> = {};
    for (const s of levelSkills) {
      skills[s.skillId] = s.rank;
    }
  
    const aptitudeModByFeat = levelFeats.length > 0
      ? resolveAptitudeModifiers(levelFeats.map((f) => f.featId), rulesetData)
      : new Map<string, { aptitudeId: string; value: number; operator: string }[]>();
  
    const feats: Record<string, Array<{ id: string; name: string; description?: string; aptitudeModifiers: { aptitudeId: string; value: number; operator: string }[] }>> = {};
    for (const f of levelFeats) {
      if (!feats[f.aptitudeId]) feats[f.aptitudeId] = [];
      const feat = rulesetData.featsById.get(f.featId);
      feats[f.aptitudeId].push({
        id: f.featId,
        name: feat?.name ?? f.featId,
        description: feat?.description ?? undefined,
        aptitudeModifiers: aptitudeModByFeat.get(f.featId) ?? [],
      });
    }
  
    // Power→aptitude level links: read straight off the composed cache's inline
    // powersAptitudesInRules join rows. All IDs are post-COW on both sides.
    const powerLevelMap = new Map<string, number | null>();
    for (const p of levelPowers) {
      const power = rulesetData.powersById.get(p.powerId);
      if (!power) continue;
      for (const pa of power.powersAptitudesInRules) {
        powerLevelMap.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
      }
    }
  
    const powers: Record<string, Array<{ id: string; name: string; description?: string; powerLevel?: number }>> = {};
    for (const p of levelPowers) {
      if (!powers[p.aptitudeId]) powers[p.aptitudeId] = [];
      const level = powerLevelMap.get(`${p.powerId}:${p.aptitudeId}`);
      const power = rulesetData.powersById.get(p.powerId);
      powers[p.aptitudeId].push({
        id: p.powerId,
        name: power?.name ?? p.powerId,
        description: power?.description ?? undefined,
        ...(level != null && { powerLevel: level }),
      });
    }
  
    return {
      characterLevelId: refreshedCharacterLevel.id,
      klassId: klass.id,
      klassName: klass.name,
      level: klassLevel.level,
      hd: klass.hd,
      hp: refreshedCharacterLevel.hp,
      abilityId: refreshedCharacterLevel.abilityId,
      skills,
      feats,
      powers,
    };
  
  });
}
