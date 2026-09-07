/**
 * Shared validation helpers for level-up operations.
 *
 * - validateAndFetchLevelSelections — validates entity ownership, ruleset lineage, aptitude links, and non-stackable uniqueness
 * - annotateRequirements — attaches eligibility and requirement tree info to candidate entities
 */

import { type Db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import {
  Feats,
} from "@/server/repositories/index.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/types.ts";
import { loadFeatCustomizations } from "./helpers.ts";

/**
 * Shared validation for level selections used by both updateLevel and finalizeLevelUp.
 * Validates entity ownership, ruleset lineage, aptitude links, and non-stackable feat uniqueness.
 */
export async function validateAndFetchLevelSelections(
  tx: Db,
  params: {
    klass: { hd: number };
    klassLevel: { id: string };
    otherLevels: { id: string; klassLevelId: string }[];
    hp: number;
    abilityId: string | null;
    skills: Record<string, number>;
    feats: Record<string, string[]>;
    powers: Record<string, string[]>;
    rulesetData: CachedRulesetData;
  },
) {
  const { klass, klassLevel, otherLevels, hp, abilityId, skills, feats, powers, rulesetData } = params;

  // Validate HP is within hit die range
  if (hp < 1 || hp > klass.hd) {
    throw new BadRequestError(`HP must be between 1 and ${klass.hd}`);
  }

  // Validate abilityId belongs to character's ruleset.
  // A cache hit means the entity is in the composed view of the character's ruleset
  // (the cache's arrays are already COW-resolved and sibling-filtered).
  if (abilityId && !rulesetData.abilitiesById.has(abilityId)) {
    throw new BadRequestError("Ability does not belong to the character's ruleset");
  }

  // Validate all referenced entity IDs belong to the character's ruleset
  const skillIds = Object.keys(skills).filter((id) => skills[id] > 0);
  const featIds = Object.values(feats).flat();
  const powerIds = Object.values(powers).flat();
  const aptitudeIds = [...new Set([...Object.keys(feats), ...Object.keys(powers)])];

  // Dedup lookups (submitted ids can contain duplicates, e.g. a non-stackable feat
  // accidentally picked under two aptitude pools — caught below).
  const uniqueSkillIds = [...new Set(skillIds)];
  const uniqueFeatIds = [...new Set(featIds)];
  const uniquePowerIds = [...new Set(powerIds)];
  const fetchedSkills = uniqueSkillIds.map((id) => rulesetData.skillsById.get(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);
  const fetchedFeats = uniqueFeatIds.map((id) => rulesetData.featsById.get(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);
  const fetchedPowers = uniquePowerIds.map((id) => rulesetData.powersById.get(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  const fetchedAptitudes = aptitudeIds.map((id) => rulesetData.aptitudesById.get(id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  if (fetchedSkills.length !== uniqueSkillIds.length) throw new BadRequestError("One or more skills not found");
  if (fetchedFeats.length !== uniqueFeatIds.length) throw new BadRequestError("One or more feats not found");
  if (fetchedPowers.length !== uniquePowerIds.length) throw new BadRequestError("One or more powers not found");
  if (fetchedAptitudes.length !== aptitudeIds.length) throw new BadRequestError("One or more aptitudes not found");

  // A non-stackable feat must not be submitted twice within the same level
  // (e.g. picked under two aptitude pools).
  const submittedFeatCounts = new Map<string, number>();
  for (const id of featIds) submittedFeatCounts.set(id, (submittedFeatCounts.get(id) ?? 0) + 1);
  for (const feat of fetchedFeats) {
    if (!feat.stackable && (submittedFeatCounts.get(feat.id) ?? 0) > 1) {
      throw new BadRequestError(`Non-stackable feat "${feat.name}" cannot be picked more than once`);
    }
  }

  // Validate feat→aptitude links exist in the ruleset. `featsAptitudesInRules`
  // is typed on FeatWithAptitudes — no cast needed.
  if (featIds.length > 0) {
    for (const [aptitudeId, ids] of Object.entries(feats)) {
      for (const featId of ids) {
        const feat = rulesetData.featsById.get(featId);
        const links = feat?.featsAptitudesInRules ?? [];
        if (!links.some((fa) => fa.aptitudeId === aptitudeId)) {
          throw new BadRequestError("Feat is not linked to the specified aptitude");
        }
      }
    }
  }

  // Validate power→aptitude links and build powerLevelMap using the cache's
  // inline `powersAptitudesInRules` join rows (already on PowerWithAptitudes).
  const powerLevelMap = new Map<string, number>();
  if (powerIds.length > 0) {
    for (const [aptitudeId, ids] of Object.entries(powers)) {
      for (const powerId of ids) {
        const power = rulesetData.powersById.get(powerId);
        const link = power?.powersAptitudesInRules.find((pa) => pa.aptitudeId === aptitudeId);
        if (!link) {
          throw new BadRequestError("Power is not linked to the specified aptitude");
        }
        if (link.level != null) {
          powerLevelMap.set(`${powerId}:${aptitudeId}`, link.level);
        }
      }
    }
  }

  // Fetch auto-granted feats for the current klass level (reused by caller for projected data)
  const autoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];

  // Check non-stackable feats aren't already on the character
  const nonStackableSubmitted = fetchedFeats.filter((f) => !f.stackable);
  if (nonStackableSubmitted.length > 0) {
    const otherLevelIds = otherLevels.map((lvl) => lvl.id);
    // Inside the caller's withRulesetScope, otherLevels[i].klassLevelId and the
    // returned feat.id are auto-remapped to post-COW by the repo Proxy, so the
    // DB IN-filter and the Set comparison both operate on post-COW ids.
    const otherKlassLevelIds = otherLevels.map((lvl) => lvl.klassLevelId);
    const pickedFeats = otherLevelIds.length > 0
      ? await Feats.findManyByCharacterLevelIds(tx, { characterLevelIds: otherLevelIds })
      : [];
    const givenFeats = otherKlassLevelIds.length > 0
      ? await Feats.findManyByKlassLevelIds(tx, { klassLevelIds: otherKlassLevelIds, characterLevelIds: otherLevelIds })
      : [];
    const existingFeatIds = new Set([...pickedFeats, ...givenFeats].map((f) => f.id));

    // Auto-granted feats come from the composed cache (already post-COW).
    for (const rec of autoGrantedRecords) {
      existingFeatIds.add(rec.featsInRule.id);
    }

    for (const feat of nonStackableSubmitted) {
      if (existingFeatIds.has(feat.id)) {
        throw new BadRequestError(`Non-stackable feat "${feat.name}" is already on this character`);
      }
    }
  }

  // Build aptitude maps
  const featToAptitude = new Map<string, string>();
  for (const [aptitudeId, ids] of Object.entries(feats)) {
    for (const id of ids) {
      featToAptitude.set(id, aptitudeId);
    }
  }

  const powerToAptitude = new Map<string, string>();
  for (const [aptitudeId, ids] of Object.entries(powers)) {
    for (const id of ids) {
      powerToAptitude.set(id, aptitudeId);
    }
  }

  // Include auto-granted feat IDs so their modifiers are loaded in the same batch
  const autoGrantedFeatIds = autoGrantedRecords.map((rec) => rec.featsInRule.id);
  const featCustomizations = loadFeatCustomizations(rulesetData, [...featIds, ...autoGrantedFeatIds]);

  return { fetchedSkills, fetchedFeats, fetchedPowers, featToAptitude, powerToAptitude, powerLevelMap, featCustomizations, autoGrantedRecords };
}

export function annotateRequirements<T extends { id: string }>(
  detailedCharacter: DetailedCharacterInterface,
  candidates: T[],
  rulesetData: CachedRulesetData,
): (T & { eligible: boolean; requirementTree?: string })[] {
  if (candidates.length === 0) return [];
  return candidates.map((candidate) => {
    const reqs = rulesetData.requirementsByEntity.get(candidate.id);
    const eligible = !reqs || reqs.length === 0
      || detailedCharacter.areRequirementsMet([reqs]);
    return {
      ...candidate,
      eligible,
      ...(!eligible && reqs ? { requirementTree: detailedCharacter.formatRequirements(reqs) } : {}),
    };
  });
}
