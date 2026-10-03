/**
 * Classes the character can take next, with their eligibility.
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Klasses } from "@/server/repositories/index.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { DetailedCharacterInterface, PreloadedRulesetData } from "@/server/rulesets/types.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { KlassLevel, Requirement, Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";

import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedFeatsFromPicks,
  buildProjectedGivenFeats,
  buildProjectedSkillsFromAllocations,
  type FeatPick,
  loadFeatCustomizations,
} from "./projection.ts";

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
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const { sourceChain } = rulesetData.cow;

    const klassPage = await Klasses.findPage(
      db,
      {
        rulesetId: characterRecord.rulesetId,
        ancestorRulesetIds: sourceChain,
        characterId,
        siblingLoserIds: rulesetData.cow.siblingIds,
        kind: "pc",
        search: where.search,
      },
      pagination,
    );

    if (klassPage.items.length === 0) {
      return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };
    }

    const characterKlassLevels = await CharacterLevels.findMaxKlassLevels(db, {
      characterId,
    });
    const characterKlassLevelMap = new Map(characterKlassLevels.map((i) => [i.klassId, i.maxLevel]));

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

    // Per-candidate requirements, the class's own and its next level's — served from the cache's requirementsByEntity
    // map.
    const requirementsByKlassLevel = new Map<string, Requirement[][]>();
    if (rulesetData) {
      for (const k of klassesWithNextLevel) {
        const groups = [k.klass.id, k.nextKlassLevel.id]
          .map((id) => rulesetData.requirementsByEntity.get(id) ?? [])
          .filter((reqs) => reqs.length > 0);
        if (groups.length > 0) requirementsByKlassLevel.set(k.nextKlassLevel.id, groups);
      }
    }

    // Candidates without requirements pass automatically
    const withoutRequirements = klassesWithNextLevel.filter((k) => !requirementsByKlassLevel.has(k.nextKlassLevel.id));
    const withRequirements = klassesWithNextLevel.filter((k) => requirementsByKlassLevel.has(k.nextKlassLevel.id));

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
      const autoGrantedRecords =
        pendingLevelKlassLevelIds?.length && preloadedRulesetData
          ? pendingLevelKlassLevelIds.flatMap(
              (klid) => preloadedRulesetData!.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [],
            )
          : [];
      const { projectedFeats } =
        pendingFeatPicks?.length && preloadedRulesetData
          ? buildProjectedFeatsFromPicks(pendingFeatPicks, "", "", preloadedRulesetData)
          : { projectedFeats: [] as NonNullable<Dnd35ProjectedCharacterData["feats"]> };
      const projectedSkills =
        pendingSkillAllocations?.length && preloadedRulesetData
          ? buildProjectedSkillsFromAllocations(
              pendingSkillAllocations,
              skillAnchorLevel.klassLevelId,
              skillAnchorLevel.id,
              preloadedRulesetData,
            )
          : [];

      // Project auto-granted feats (free/virtual) from pending klass levels
      // so they're visible during requirement evaluation (e.g., Monk L1 grants Improved Unarmed Strike).
      let projectedGivenFeats: Dnd35ProjectedCharacterData["givenFeats"] = [];
      if (autoGrantedRecords.length > 0 && preloadedRulesetData) {
        const autoGrantedCustomizations = loadFeatCustomizations(
          preloadedRulesetData,
          autoGrantedRecords.map((rec) => rec.featsInRule.id),
        );
        projectedGivenFeats = buildProjectedGivenFeats(
          autoGrantedRecords,
          pendingLevels[0].id,
          autoGrantedCustomizations,
        );
      }

      const hasProjections =
        pendingLevels.length > 0 ||
        projectedFeats.length > 0 ||
        projectedGivenFeats.length > 0 ||
        projectedSkills.length > 0;
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
        requirementGroups: requirementsByKlassLevel.get(k.nextKlassLevel.id)!,
      }));
      const projectedCharLevel = buildProjectedCharacterLevel(characterId, "");
      const evaluationResults = await levelUpProjector.evaluateClassAvailability(candidates, projectedCharLevel);
      for (const [klassLevelId, result] of evaluationResults) {
        evaluationResultMap.set(klassLevelId, result);
      }
    }

    const items = [
      ...withoutRequirements.map((k) => ({
        ...k.klass,
        nextLevel: k.nextKlassLevel.level,
        maxLevel: maxLevelMap.get(k.klass.id) ?? k.nextKlassLevel.level,
        eligible: true,
        requirementTree: undefined as string | undefined,
      })),
      ...withRequirements.map((k) => {
        const eligible = evaluationResultMap.get(k.nextKlassLevel.id) ?? false;
        const groups = requirementsByKlassLevel.get(k.nextKlassLevel.id);
        return {
          ...k.klass,
          nextLevel: k.nextKlassLevel.level,
          maxLevel: maxLevelMap.get(k.klass.id) ?? k.nextKlassLevel.level,
          eligible,
          requirementTree:
            !eligible && groups && detailedCharacter
              ? groups.map((reqs) => detailedCharacter.formatRequirements(reqs)).join("\n")
              : undefined,
        };
      }),
    ].sort((a, b) => b.nextLevel - a.nextLevel || a.name.localeCompare(b.name));

    return { items, page: klassPage.page, nextPage: klassPage.nextPage };
  });
}
