/**
 * Shared validation helpers for level-up operations.
 *
 * - checkAbilityIncrease — a level takes an ability increase exactly when it has one
 * - checkSelections — submitted selections are the ruleset's, and linked to their pools
 * - validateAndFetchLevelSelections — validates entity ownership, ruleset lineage, aptitude links, and non-stackable uniqueness
 * - annotateRequirements — attaches eligibility and requirement tree info to candidate entities
 */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { type Db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { Feats } from "@/server/repositories/index.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/types.ts";

import { loadFeatCustomizations } from "./projection.ts";

type FeatRecord = { id: string; name: string; stackable: boolean };

/** Throws when a non-stackable feat is picked more than once in the level (under two pools). */
function checkRepeatedPicks(featIds: string[], fetchedFeats: FeatRecord[]) {
  const submittedFeatCounts = new Map<string, number>();
  for (const id of featIds) submittedFeatCounts.set(id, (submittedFeatCounts.get(id) ?? 0) + 1);
  for (const feat of fetchedFeats) {
    if (!feat.stackable && (submittedFeatCounts.get(feat.id) ?? 0) > 1) {
      throw new BadRequestError(`Non-stackable feat "${feat.name}" cannot be picked more than once`);
    }
  }
}

/** The rows of these ids, deduplicated, from the character's ruleset; throws when one isn't in it. */
function fetchAll<T>(ids: string[], byId: Map<string, T>, what: string): T[] {
  const uniqueIds = [...new Set(ids)];
  const fetched = uniqueIds.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
  if (fetched.length !== uniqueIds.length) throw new BadRequestError(`One or more ${what} not found`);
  return fetched;
}

/** The submitted skills, feats and powers, from the character's ruleset; throws when one, or a pool, isn't in it. */
function fetchSelections(
  rulesetData: RulesetData,
  skills: Record<string, number>,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
) {
  const skillIds = Object.keys(skills).filter((id) => skills[id] > 0);
  const fetchedSkills = fetchAll(skillIds, rulesetData.skillsById, "skills");
  const fetchedFeats = fetchAll(Object.values(feats).flat(), rulesetData.featsById, "feats");
  const fetchedPowers = fetchAll(Object.values(powers).flat(), rulesetData.powersById, "powers");
  fetchAll([...Object.keys(feats), ...Object.keys(powers)], rulesetData.aptitudesById, "aptitudes");
  return { fetchedSkills, fetchedFeats, fetchedPowers };
}

/**
 * Throws when a feat or a power isn't linked to the pool it's picked under. Returns each leveled power's spell level
 * in its pool, by `powerId:aptitudeId`.
 */
function linkedPowerLevels(
  rulesetData: RulesetData,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
) {
  for (const [aptitudeId, ids] of Object.entries(feats)) {
    for (const featId of ids) {
      const links = rulesetData.featsById.get(featId)?.featsAptitudesInRules ?? [];
      if (!links.some((fa) => fa.aptitudeId === aptitudeId)) {
        throw new BadRequestError("Feat is not linked to the specified aptitude");
      }
    }
  }

  const powerLevelMap = new Map<string, number>();
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
  return powerLevelMap;
}

/** The pool each picked id is picked under. */
function poolsOf(selections: Record<string, string[]>) {
  const pools = new Map<string, string>();
  for (const [aptitudeId, ids] of Object.entries(selections)) {
    for (const id of ids) {
      pools.set(id, aptitudeId);
    }
  }
  return pools;
}

/**
 * Throws when a non-stackable feat picked is already on the character: picked or granted at its other levels, or
 * granted at this one.
 */
async function checkNotTaken(
  tx: Db,
  fetchedFeats: FeatRecord[],
  otherLevels: { id: string; klassLevelId: string }[],
  autoGrantedRecords: { featsInRule: { id: string } }[],
) {
  const nonStackableSubmitted = fetchedFeats.filter((f) => !f.stackable);
  if (nonStackableSubmitted.length === 0) return;

  const otherLevelIds = otherLevels.map((lvl) => lvl.id);
  // Inside the caller's withRulesetScope, otherLevels[i].klassLevelId and the
  // returned feat.id are auto-remapped to post-COW by the repo Proxy: the
  // grants are the copied class level's, and the Set compares post-COW ids.
  const pickedFeats = await Feats.findPicks(tx, { characterLevelIds: otherLevelIds });
  const givenFeats = await Feats.findGrants(tx, { levels: otherLevels });
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

export function annotateRequirements<T extends { id: string }>(
  detailedCharacter: DetailedCharacterInterface,
  candidates: T[],
  rulesetData: RulesetData,
): (T & { eligible: boolean; requirementTree?: string })[] {
  if (candidates.length === 0) return [];
  return candidates.map((candidate) => {
    const reqs = rulesetData.requirementsByEntity.get(candidate.id);
    const eligible = !reqs || reqs.length === 0 || detailedCharacter.areRequirementsMet([reqs]);
    return {
      ...candidate,
      eligible,
      ...(!eligible && reqs ? { requirementTree: detailedCharacter.formatRequirements(reqs) } : {}),
    };
  });
}

/**
 * Throws when a level takes an ability increase it doesn't have, or skips the one it has. `label` names the level in
 * the message ("Level 2: ").
 */
export function checkAbilityIncrease(isAbilityIncreaseLevel: boolean, abilityId: string | null, label = "") {
  if (abilityId && !isAbilityIncreaseLevel) {
    throw new BadRequestError(`${label}Ability increase is not available at this level`);
  }
  if (!abilityId && isAbilityIncreaseLevel) {
    throw new BadRequestError(`${label}Ability increase is required at this level`);
  }
}

/** Throws when a submitted selection isn't the character's ruleset's, or isn't linked to the pool it's picked under. */
export function checkSelections(
  rulesetData: RulesetData,
  skills: Record<string, number>,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
) {
  fetchSelections(rulesetData, skills, feats, powers);
  linkedPowerLevels(rulesetData, feats, powers);
}

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
    rulesetData: RulesetData;
  },
) {
  const { klass, klassLevel, otherLevels, hp, abilityId, skills, feats, powers, rulesetData } = params;

  if (hp < 1 || hp > klass.hd) {
    throw new BadRequestError(`HP must be between 1 and ${klass.hd}`);
  }

  // A cache hit means the entity is in the composed view of the character's ruleset
  // (the cache's arrays are already COW-resolved and sibling-filtered).
  if (abilityId && !rulesetData.abilitiesById.has(abilityId)) {
    throw new BadRequestError("Ability does not belong to the character's ruleset");
  }

  // Submitted ids can repeat, e.g. a non-stackable feat picked under two aptitude pools: caught by checkRepeatedPicks.
  const featIds = Object.values(feats).flat();
  const { fetchedSkills, fetchedFeats, fetchedPowers } = fetchSelections(rulesetData, skills, feats, powers);
  checkRepeatedPicks(featIds, fetchedFeats);
  const powerLevelMap = linkedPowerLevels(rulesetData, feats, powers);

  // Fetch auto-granted feats for the current klass level (reused by caller for projected data)
  const autoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];
  await checkNotTaken(tx, fetchedFeats, otherLevels, autoGrantedRecords);

  // Include auto-granted feat IDs so their modifiers are loaded in the same batch
  const autoGrantedFeatIds = autoGrantedRecords.map((rec) => rec.featsInRule.id);
  const featCustomizations = loadFeatCustomizations(rulesetData, [...featIds, ...autoGrantedFeatIds]);

  return {
    fetchedSkills,
    fetchedFeats,
    fetchedPowers,
    featToAptitude: poolsOf(feats),
    powerToAptitude: poolsOf(powers),
    powerLevelMap,
    featCustomizations,
    autoGrantedRecords,
  };
}
