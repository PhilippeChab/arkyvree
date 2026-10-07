/**
 * Classes the character can take next, with their eligibility.
 */

import { type RulesetData } from "@/engine/core/view/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Klasses } from "@/server/repositories/index.ts";
import type { Dnd35DetailedCharacter, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Klass, KlassLevel, Requirement, Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedFeatsFromPicks,
  buildProjectedGivenFeats,
  buildProjectedSkillsFromAllocations,
  type FeatPick,
  loadFeatCustomizations,
} from "./projection.ts";

type KlassWithNextLevel = { klass: Klass; nextKlassLevel: KlassLevel };

/** The classes the character can take another level of, each with that level. */
function klassesWithNextLevel(klasses: Klass[], characterKlassLevelMap: Map<string, number>, rulesetData: RulesetData) {
  // Next klass level per class (served from cache — no DB)
  const nextKlassLevelMap = new Map<string, KlassLevel>();
  for (const klass of klasses) {
    const nextLevel = (characterKlassLevelMap.get(klass.id) || 0) + 1;
    const kl = rulesetData.klassLevelByKlassAndLevel.get(`${klass.id}:${nextLevel}`);
    if (kl) nextKlassLevelMap.set(klass.id, kl);
  }
  return klasses
    .filter((klass) => nextKlassLevelMap.has(klass.id))
    .map((klass) => ({ klass, nextKlassLevel: nextKlassLevelMap.get(klass.id)! }));
}

/**
 * What the level-up wizard's pending picks add to the character: its pending levels with the feats their class levels
 * grant, its picked feats and its skill ranks. Undefined when there are none.
 */
function pendingProjection(
  characterId: string,
  pendingLevels: ReturnType<typeof buildPendingCharacterLevels>,
  rulesetData: RulesetData,
  pendingLevelKlassLevelIds?: string[],
  pendingFeatPicks?: FeatPick[],
  pendingSkillAllocations?: { rank: number; skillId: string }[],
): Dnd35ProjectedCharacterData | undefined {
  const skillAnchorLevel = pendingLevels[0] ?? buildProjectedCharacterLevel(characterId, "");
  const autoGrantedRecords = pendingLevelKlassLevelIds?.length
    ? pendingLevelKlassLevelIds.flatMap((klid) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [])
    : [];
  const { projectedFeats } = pendingFeatPicks?.length
    ? buildProjectedFeatsFromPicks(pendingFeatPicks, "", "", rulesetData)
    : { projectedFeats: [] as NonNullable<Dnd35ProjectedCharacterData["feats"]> };
  const projectedSkills = pendingSkillAllocations?.length
    ? buildProjectedSkillsFromAllocations(
        pendingSkillAllocations,
        skillAnchorLevel.klassLevelId,
        skillAnchorLevel.id,
        rulesetData,
      )
    : [];

  // Project auto-granted feats (free/virtual) from pending klass levels
  // so they're visible during requirement evaluation (e.g., Monk L1 grants Improved Unarmed Strike).
  let projectedGivenFeats: Dnd35ProjectedCharacterData["givenFeats"] = [];
  if (autoGrantedRecords.length > 0) {
    const autoGrantedCustomizations = loadFeatCustomizations(
      rulesetData,
      autoGrantedRecords.map((rec) => rec.featsInRule.id),
    );
    projectedGivenFeats = buildProjectedGivenFeats(autoGrantedRecords, pendingLevels[0].id, autoGrantedCustomizations);
  }

  const hasProjections =
    pendingLevels.length > 0 ||
    projectedFeats.length > 0 ||
    projectedGivenFeats.length > 0 ||
    projectedSkills.length > 0;
  return hasProjections
    ? {
        ...(pendingLevels.length > 0 && { characterLevels: pendingLevels }),
        ...(projectedFeats.length > 0 && { feats: projectedFeats }),
        ...(projectedGivenFeats.length > 0 && { givenFeats: projectedGivenFeats }),
        ...(projectedSkills.length > 0 && { skills: projectedSkills }),
      }
    : undefined;
}

/** Each candidate's requirement groups, its class's own and its next level's, by its next level; none without any. */
function requirementsByNextLevel(candidates: KlassWithNextLevel[], rulesetData: RulesetData) {
  const requirementsByKlassLevel = new Map<string, Requirement[][]>();
  for (const k of candidates) {
    const groups = [k.klass.id, k.nextKlassLevel.id]
      .map((id) => rulesetData.requirementsByEntity.get(id) ?? [])
      .filter((reqs) => reqs.length > 0);
    if (groups.length > 0) requirementsByKlassLevel.set(k.nextKlassLevel.id, groups);
  }
  return requirementsByKlassLevel;
}

export async function getAvailableKlasses(
  session: Session,
  characterId: string,
  where: { search?: string },
  pagination: { limit: number; page: number },
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
  pendingFeatPicks?: FeatPick[],
  pendingSkillAllocations?: { rank: number; skillId: string }[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const { sourceChain } = rulesetData.cow;

    const klassPage = await Klasses.findPage(
      db,
      {
        rulesetId: characterRecord.rulesetId,
        ancestorRulesetIds: sourceChain,
        characterId,
        kind: "pc",
        search: where.search,
      },
      pagination,
    );

    if (klassPage.items.length === 0) return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };

    const characterKlassLevels = await CharacterLevels.findMaxKlassLevels(db, {
      characterId,
    });
    const characterKlassLevelMap = new Map(characterKlassLevels.map((i) => [i.klassId, i.maxLevel]));

    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
      : [];

    const candidates = klassesWithNextLevel(klassPage.items, characterKlassLevelMap, rulesetData);
    if (candidates.length === 0) return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };

    // Per-candidate requirements — served from the cache's requirementsByEntity map.
    const requirementsByKlassLevel = requirementsByNextLevel(candidates, rulesetData);

    // Candidates without requirements pass automatically
    const withoutRequirements = candidates.filter((k) => !requirementsByKlassLevel.has(k.nextKlassLevel.id));
    const withRequirements = candidates.filter((k) => requirementsByKlassLevel.has(k.nextKlassLevel.id));

    // For candidates with requirements, build the character once and evaluate via projector.
    const evaluationResultMap = new Map<string, boolean>();
    let detailedCharacter: Dnd35DetailedCharacter | undefined;
    if (withRequirements.length > 0) {
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);

      const projectedData = pendingProjection(
        characterId,
        pendingLevels,
        rulesetData,
        pendingLevelKlassLevelIds,
        pendingFeatPicks,
        pendingSkillAllocations,
      );
      await detailedCharacter.build(undefined, projectedData, scope);

      const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter);
      const evaluated = withRequirements.map((k) => ({
        klassName: stripSeparators(k.klass.name),
        klassLevel: k.nextKlassLevel,
        requirementGroups: requirementsByKlassLevel.get(k.nextKlassLevel.id)!,
      }));
      const projectedCharLevel = buildProjectedCharacterLevel(characterId, "");
      const evaluationResults = await levelUpProjector.evaluateClassAvailability(evaluated, projectedCharLevel);
      for (const [klassLevelId, result] of evaluationResults) evaluationResultMap.set(klassLevelId, result);
    }

    const items = [
      ...withoutRequirements.map((k) => ({
        ...k.klass,
        nextLevel: k.nextKlassLevel.level,
        maxLevel: rulesetData.klassLevelsByKlassId.get(k.klass.id)?.at(-1)?.level ?? k.nextKlassLevel.level,
        eligible: true,
        requirementTree: undefined as string | undefined,
      })),
      ...withRequirements.map((k) => {
        const eligible = evaluationResultMap.get(k.nextKlassLevel.id) ?? false;
        const groups = requirementsByKlassLevel.get(k.nextKlassLevel.id);
        return {
          ...k.klass,
          nextLevel: k.nextKlassLevel.level,
          maxLevel: rulesetData.klassLevelsByKlassId.get(k.klass.id)?.at(-1)?.level ?? k.nextKlassLevel.level,
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
