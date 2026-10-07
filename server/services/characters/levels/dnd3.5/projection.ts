/**
 * Building projected character data during level-up:
 *
 * - getLevelIdsFromOnward — returns IDs of a level and all subsequent levels
 * - loadFeatCustomizations — batch-loads modifiers, properties, requirements for feats
 * - buildProjectedFeatsFromPicks — builds projected feats from user-selected (featId, aptitudeId) picks
 * - buildProjectedAutoGrantedFeats — filters and formats auto-granted feats for projection
 * - buildProjectedCharacterLevel — creates a temporary character level for projection
 * - buildPendingCharacterLevels — creates projected levels from pending batch data
 * - buildProjectedSkillsFromAllocations — builds projected skills from skill allocation data
 * - projectPlannedLevels — projects planned levels with the feats their class levels grant
 * - buildBaselineAptitudes — the aptitudes of the character as saved, before planned levels
 */

import type { ProjectedCharacterData, ProjectedCharacterLevel } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type {
  Dnd35DetailedCharacter,
  Dnd35ProjectedCharacterData,
  Dnd35RulesetModule,
} from "@/server/rulesets/dnd3.5/index.ts";
import type { Character, Modifier, Property, Requirement } from "@/shared/relations.ts";

export type FeatPick = { aptitudeId: string; featId: string };

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

/** Builds projected auto-granted feats for character projection, filtering out user-picked feats. */
export function buildProjectedAutoGrantedFeats<T extends { id: string }>(
  autoGrantedRecords: Array<{
    aptitudeId: string;
    featsInRule: T;
    free: boolean;
    id: string;
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
      properties: [],
      requirements: [],
    }));
}

/** A new level of class level `klassLevelId`, which the loader places after the character's saved levels. */
export function buildProjectedCharacterLevel(
  characterId: string,
  klassLevelId: string,
  abilityId?: string | null,
): ProjectedCharacterLevel {
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

export function buildProjectedFeatsFromPicks(
  selectedFeatPicks: FeatPick[],
  klassLevelId: string,
  projectedCharacterLevelId: string,
  rulesetData: RulesetData,
): NonNullable<ProjectedCharacterData["feats"]> {
  if (selectedFeatPicks.length === 0) return [];

  // Dedup by (featId, aptitudeId) — the wizard sometimes sends the same pick
  // under both `selectedFeatPicks` and `pendingLevelFeatPicks` (Add Level batch
  // treats all picks as pending). Without this, projection doubles up and
  // applies modifiers twice. Legitimate multi-pool picks of the same feat
  // (different aptitudeIds) are preserved.
  const uniquePicks = [...new Map(selectedFeatPicks.map((p) => [`${p.featId}:${p.aptitudeId}`, p])).values()];
  const uniqueFeatIds = [...new Set(uniquePicks.map((p) => p.featId))];
  const customizations = loadFeatCustomizations(rulesetData, uniqueFeatIds);

  return uniquePicks
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
}

/** Maps auto-granted feat records to projected givenFeats format for character building. */
export function buildProjectedGivenFeats<T extends { id: string }>(
  autoGrantedRecords: Array<{
    aptitudeId: string;
    featsInRule: T;
    id: string;
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
    properties: [],
    requirements: [],
  }));
}

/** Maps validated selections to projected skill/feat/power data for character building. */
export function buildProjectedSelections<S extends { id: string }, F extends { id: string }, P extends { id: string }>(
  klassLevelId: string,
  characterLevelId: string,
  skills: Record<string, number>,
  v: {
    featCustomizations: Awaited<ReturnType<typeof loadFeatCustomizations>>;
    featToAptitude: Map<string, string>;
    fetchedFeats: F[];
    fetchedPowers: P[];
    fetchedSkills: S[];
    powerLevelMap: Map<string, number>;
    powerToAptitude: Map<string, string>;
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
      powerLevel: v.powerLevelMap.get(`${power.id}:${v.powerToAptitude.get(power.id)}`) ?? null,
      saveName: null,
    })),
  };
}

/** Builds projected skill records from skill ID + rank allocations for requirement evaluation. */
export function buildProjectedSkillsFromAllocations(
  allocations: { rank: number; skillId: string }[],
  klassLevelId: string,
  characterLevelId: string,
  rulesetData: RulesetData,
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

/** Returns IDs of the given level and all subsequent levels (in the order the character took them). */
export function getLevelIdsFromOnward(
  characterLevels: { id: string; position: number }[],
  characterLevelId: string,
): string[] {
  const sorted = characterLevels.toSorted((a, b) => a.position - b.position);
  const index = sorted.findIndex((l) => l.id === characterLevelId);
  if (index === -1) return [];
  return sorted.slice(index).map((l) => l.id);
}

/** Loads modifiers, properties, and requirements for feats so projected data carries full effects. */
export function loadFeatCustomizations(rulesetData: RulesetData, featIds: string[]) {
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

/**
 * The projected data of planned levels: a character level each, and the feats their class levels grant. Also returns
 * those grants' records, per level.
 */
export function projectPlannedLevels(
  characterId: string,
  plannedLevels: { abilityId: string | null; klassLevel: { id: string } }[],
  rulesetData: RulesetData,
) {
  const projectedCharacterLevels = plannedLevels.map(({ klassLevel, abilityId }) =>
    buildProjectedCharacterLevel(characterId, klassLevel.id, abilityId),
  );
  const allAutoGrantedFeatRecords = plannedLevels.map(
    ({ klassLevel }) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
  );
  const autoGrantedFeatCustomizations = loadFeatCustomizations(
    rulesetData,
    allAutoGrantedFeatRecords.flat().map((rec) => rec.featsInRule.id),
  );
  const projectedData: Dnd35ProjectedCharacterData = {
    characterLevels: projectedCharacterLevels,
    givenFeats: allAutoGrantedFeatRecords.flatMap((records, i) =>
      buildProjectedGivenFeats(records, projectedCharacterLevels[i].id, autoGrantedFeatCustomizations),
    ),
  };
  return { projectedData, allAutoGrantedFeatRecords };
}

/** The aptitudes of the character as saved, before its planned levels: built from the projected character's data. */
export async function buildBaselineAptitudes(
  database: Db,
  rulesetModule: Dnd35RulesetModule,
  characterRecord: Character,
  projectedCharacter: Dnd35DetailedCharacter,
  scope: RulesetScope,
) {
  const preloaded = await projectedCharacter.preload(database, scope);
  const baselineCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await baselineCharacter.build(database, undefined, preloaded);
  return baselineCharacter.components.aptitudes.getAptitudes();
}
