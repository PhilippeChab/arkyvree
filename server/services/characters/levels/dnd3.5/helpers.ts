/**
 * Shared helpers for building projected character data during level-up.
 *

 * - getLevelIdsFromOnward — returns IDs of a level and all subsequent levels
 * - loadFeatCustomizations — batch-loads modifiers, properties, requirements for feats
 * - buildProjectedFeatsFromPicks — builds projected feats from user-selected (featId, aptitudeId) picks
 * - buildProjectedAutoGrantedFeats — filters and formats auto-granted feats for projection
 * - buildProjectedCharacterLevel — creates a temporary character level for projection
 * - buildPendingCharacterLevels — creates projected levels from pending batch data
 * - buildProjectedSkillsFromAllocations — builds projected skills from skill allocation data
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { ProjectedCharacterData } from "@/server/rulesets/types.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

/** Returns IDs of the given level and all subsequent levels (by creation order). */
export function getLevelIdsFromOnward(
  characterLevels: { id: string; createdAt: string }[],
  characterLevelId: string,
): string[] {
  const sorted = [...characterLevels].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const index = sorted.findIndex((l) => l.id === characterLevelId);
  if (index === -1) return [];
  return sorted.slice(index).map((l) => l.id);
}

/** Loads modifiers, properties, and requirements for feats so projected data carries full effects. */
export function loadFeatCustomizations(rulesetData: CachedRulesetData, featIds: string[]) {
  const modifiersMap = new Map<string, Modifier[]>();
  const propertiesMap = new Map<string, Property[]>();
  const requirementsMap = new Map<string, Requirement[]>();

  for (const featId of featIds) {
    const mods = rulesetData.modifiersBySource.get(featId);
    if (mods) modifiersMap.set(featId, mods);
    const props = rulesetData.propertiesByEntity.get(featId);
    if (props) propertiesMap.set(featId, props);
    const reqs = rulesetData.requirementsByEntity.get(featId);
    if (reqs) requirementsMap.set(featId, reqs);
  }

  return {
    modifiers: modifiersMap,
    properties: propertiesMap,
    requirements: requirementsMap,
  };
}

export type FeatPick = { featId: string; aptitudeId: string };

export function buildProjectedFeatsFromPicks(
  selectedFeatPicks: FeatPick[],
  klassLevelId: string,
  projectedCharacterLevelId: string,
  rulesetData: CachedRulesetData,
): {
  projectedFeats: NonNullable<ProjectedCharacterData["feats"]>;
  nonStackableFeatIds: string[];
} {
  if (selectedFeatPicks.length === 0) {
    return { projectedFeats: [], nonStackableFeatIds: [] };
  }

  // Dedup by (featId, aptitudeId) — the wizard sometimes sends the same pick
  // under both `selectedFeatPicks` and `pendingLevelFeatPicks` (Add Level batch
  // treats all picks as pending). Without this, projection doubles up and
  // applies modifiers twice. Legitimate multi-pool picks of the same feat
  // (different aptitudeIds) are preserved.
  const uniquePicks = [...new Map(
    selectedFeatPicks.map((p) => [`${p.featId}:${p.aptitudeId}`, p]),
  ).values()];
  const uniqueFeatIds = [...new Set(uniquePicks.map((p) => p.featId))];
  const customizations = loadFeatCustomizations(rulesetData, uniqueFeatIds);

  const projectedFeats = uniquePicks
    .map((pick) => {
      const feat = rulesetData.featsById.get(pick.featId);
      if (!feat) return null;
      return {
        ...feat,
        klassLevelId,
        characterLevelId: projectedCharacterLevelId,
        aptitudeId: pick.aptitudeId,
        modifiers: customizations.modifiers.get(feat.id) ?? [],
        properties: customizations.properties.get(feat.id) ?? [],
        requirements: customizations.requirements.get(feat.id) ?? [],
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const nonStackableFeatIds = uniqueFeatIds
    .map((id) => rulesetData.featsById.get(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined && !f.stackable)
    .map((f) => f.id);

  return { projectedFeats, nonStackableFeatIds };
}

/** Builds projected auto-granted feats for character projection, filtering out user-picked feats. */
export function buildProjectedAutoGrantedFeats<T extends { id: string }>(
  autoGrantedRecords: Array<{
    id: string;
    free: boolean;
    featsInRule: T;
    aptitudeId: string;
  }>,
  klassLevelId: string,
  characterLevelId: string,
  pickedFeatIds: Set<string>,
  featCustomizations: { modifiers: Map<string, Modifier[]> },
) {
  return autoGrantedRecords
    .filter((rec) => rec.free && !pickedFeatIds.has(rec.featsInRule.id))
    .map((rec) => ({
      ...rec.featsInRule,
      klassLevelId,
      klassLevelFeatId: rec.id,
      characterLevelId,
      aptitudeId: rec.aptitudeId,
      modifiers: featCustomizations.modifiers.get(rec.featsInRule.id) ?? [],
      properties: [] as never[],
      requirements: [] as never[],
    }));
}

export function buildProjectedCharacterLevel(
  characterId: string,
  klassLevelId: string,
  abilityId?: string | null,
) {
  return {
    id: crypto.randomUUID(),
    characterId,
    klassLevelId,
    hp: 10,
    abilityId: abilityId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

/** Builds projected character levels from pending batch level data (klass level IDs + optional ability IDs). */
export function buildPendingCharacterLevels(
  characterId: string,
  pendingLevelKlassLevelIds: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  return pendingLevelKlassLevelIds.map((klassLevelId, i) => {
    const abilityId = pendingLevelAbilityIds?.[i] || null;
    return buildProjectedCharacterLevel(characterId, klassLevelId, abilityId);
  });
}

/** Maps validated selections to projected skill/feat/power data for character building. */
export function buildProjectedSelections<
  S extends { id: string },
  F extends { id: string },
  P extends { id: string },
>(
  klassLevelId: string,
  characterLevelId: string,
  skills: Record<string, number>,
  v: {
    fetchedSkills: S[];
    fetchedFeats: F[];
    fetchedPowers: P[];
    featToAptitude: Map<string, string>;
    powerToAptitude: Map<string, string>;
    powerLevelMap: Map<string, number>;
    featCustomizations: Awaited<ReturnType<typeof loadFeatCustomizations>>;
  },
) {
  return {
    skills: v.fetchedSkills.map((skill) => ({
      ...skill,
      klassLevelId,
      characterLevelId,
      rank: skills[skill.id],
    })),
    feats: v.fetchedFeats.map((feat) => ({
      ...feat,
      klassLevelId,
      characterLevelId,
      aptitudeId: v.featToAptitude.get(feat.id)!,
      modifiers: v.featCustomizations.modifiers.get(feat.id) ?? [],
      properties: v.featCustomizations.properties.get(feat.id) ?? [],
      requirements: v.featCustomizations.requirements.get(feat.id) ?? [],
    })),
    powers: v.fetchedPowers.map((power) => ({
      ...power,
      klassLevelId,
      characterLevelId,
      aptitudeId: v.powerToAptitude.get(power.id)!,
      powerLevel:
        v.powerLevelMap.get(`${power.id}:${v.powerToAptitude.get(power.id)}`) ?? null,
      saveName: null,
    })),
  };
}

/** Maps auto-granted feat records to projected givenFeats format for character building. */
export function buildProjectedGivenFeats<T extends { id: string }>(
  autoGrantedRecords: Array<{
    id: string;
    featsInRule: T;
    aptitudeId: string;
    klassLevelId: string;
  }>,
  characterLevelId: string,
  customizations: { modifiers: Map<string, Modifier[]> },
) {
  return autoGrantedRecords.map((rec) => ({
    ...rec.featsInRule,
    klassLevelId: rec.klassLevelId,
    klassLevelFeatId: rec.id,
    characterLevelId,
    aptitudeId: rec.aptitudeId,
    modifiers: customizations.modifiers.get(rec.featsInRule.id) ?? [],
    properties: [] as never[],
    requirements: [] as never[],
  }));
}

/** Builds projected skill records from skill ID + rank allocations for requirement evaluation. */
export function buildProjectedSkillsFromAllocations(
  allocations: { skillId: string; rank: number }[],
  klassLevelId: string,
  characterLevelId: string,
  rulesetData: CachedRulesetData,
) {
  if (allocations.length === 0) return [];

  // Dedup by skillId — previously `new Map(allocations.map(a => [a.skillId, a.rank]))`
  // collapsed duplicates with last-rank-wins. Preserve that semantics so callers
  // that accidentally pass the same skillId twice don't produce duplicate projected
  // rows (which would skew skill-rank budgeting in the projected character).
  const rankBySkillId = new Map<string, number>();
  for (const a of allocations) rankBySkillId.set(a.skillId, a.rank);

  return [...rankBySkillId.entries()]
    .map(([skillId, rank]) => {
      const skill = rulesetData.skillsById.get(skillId);
      if (!skill) return null;
      return { ...skill, klassLevelId, characterLevelId, rank };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}
