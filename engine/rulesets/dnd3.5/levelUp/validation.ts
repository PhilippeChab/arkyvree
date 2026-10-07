/**
 * Shared validation helpers for level-up operations.
 *
 * - checkAbilityIncrease — a level takes an ability increase exactly when it has one
 * - checkSelections — submitted selections are the ruleset's, and linked to their pools
 * - checkLevelSelections — a level's hit points, ability and selections: lineage, links, repeats; and what it's granted
 * - checkNotTaken — no non-stackable feat the character already has
 * - annotateRequirements — attaches eligibility and requirement tree info to candidate entities
 */

import type { DetailedCharacterInterface } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ValidationIssue } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { Dnd35LevelsRules } from "@/engine/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";

import { loadFeatCustomizations } from "./projection.ts";

type FeatRecord = { id: string; name: string; stackable: boolean };

/** Throws when a non-stackable feat is picked more than once in the level (under two pools). */
function checkRepeatedPicks(featIds: string[], fetchedFeats: FeatRecord[]) {
  const submittedFeatCounts = new Map<string, number>();
  for (const id of featIds) submittedFeatCounts.set(id, (submittedFeatCounts.get(id) ?? 0) + 1);
  for (const feat of fetchedFeats) {
    if (!feat.stackable && (submittedFeatCounts.get(feat.id) ?? 0) > 1)
      throw new RulesError("invalid", `Non-stackable feat "${feat.name}" cannot be picked more than once`);
  }
}

/** The rows of these ids, deduplicated, from the character's ruleset; throws when one isn't in it. */
function fetchAll<T>(ids: string[], byId: Map<string, T>, what: string): T[] {
  const uniqueIds = [...new Set(ids)];
  const fetched = uniqueIds.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
  if (fetched.length !== uniqueIds.length) throw new RulesError("invalid", `One or more ${what} not found`);
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
      if (!links.some((fa) => fa.aptitudeId === aptitudeId))
        throw new RulesError("invalid", "Feat is not linked to the specified aptitude");
    }
  }

  const powerLevelMap = new Map<string, number>();
  for (const [aptitudeId, ids] of Object.entries(powers)) {
    for (const powerId of ids) {
      const power = rulesetData.powersById.get(powerId);
      const link = power?.powersAptitudesInRules.find((pa) => pa.aptitudeId === aptitudeId);
      if (!link) throw new RulesError("invalid", "Power is not linked to the specified aptitude");

      if (link.level != null) powerLevelMap.set(`${powerId}:${aptitudeId}`, link.level);
    }
  }
  return powerLevelMap;
}

/** The pool each picked id is picked under. */
function poolsOf(selections: Record<string, string[]>) {
  const pools = new Map<string, string>();
  for (const [aptitudeId, ids] of Object.entries(selections)) for (const id of ids) pools.set(id, aptitudeId);

  return pools;
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
 * Throws when the level after `totalLevel` levels takes an ability increase it doesn't have, or skips the one it has.
 * `label` names the level in the message ("Level 2: ").
 */
export function checkAbilityIncrease(totalLevel: number, abilityId: string | null, label = "") {
  const isAbilityIncreaseLevel = Dnd35LevelsRules.isAbilityIncreaseLevel(totalLevel);
  if (abilityId && !isAbilityIncreaseLevel)
    throw new RulesError("invalid", `${label}Ability increase is not available at this level`);

  if (!abilityId && isAbilityIncreaseLevel)
    throw new RulesError("invalid", `${label}Ability increase is required at this level`);
}

/**
 * Refuses a level whose character fails its rules: what it fails, as the refusal's issues, its messages as its own.
 */
export function checkIssues(issues: ValidationIssue[]) {
  if (issues.length > 0) throw new RulesError("invalid", issues.map((issue) => issue.message).join("; "), issues);
}

/**
 * A level's hit points, ability and selections checked, for both the level save and the level-up's: each selection the
 * ruleset's and linked to its pool, no non-stackable feat picked twice; and what the level is granted, with the feats'
 * customizations. Whether a feat is already on the character is `checkNotTaken`'s, which the caller's reads feed.
 */
export function checkLevelSelections(params: {
  abilityId: string | null;
  feats: Record<string, string[]>;
  hp: number;
  klass: { hd: number };
  klassLevel: { id: string };
  powers: Record<string, string[]>;
  rulesetData: RulesetData;
  skills: Record<string, number>;
}) {
  const { klass, klassLevel, hp, abilityId, skills, feats, powers, rulesetData } = params;

  if (hp < 1 || hp > klass.hd) throw new RulesError("invalid", `HP must be between 1 and ${klass.hd}`);

  // A cache hit means the entity is in the composed view of the character's ruleset
  // (the cache's arrays are already COW-resolved and sibling-filtered).
  if (abilityId && !rulesetData.abilitiesById.has(abilityId))
    throw new RulesError("invalid", "Ability does not belong to the character's ruleset");

  // Submitted ids can repeat, e.g. a non-stackable feat picked under two aptitude pools: caught by checkRepeatedPicks.
  const featIds = Object.values(feats).flat();
  const { fetchedSkills, fetchedFeats, fetchedPowers } = fetchSelections(rulesetData, skills, feats, powers);
  checkRepeatedPicks(featIds, fetchedFeats);
  const powerLevelMap = linkedPowerLevels(rulesetData, feats, powers);

  // Fetch auto-granted feats for the current klass level (reused by caller for projected data)
  const autoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];

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

/**
 * Throws when a non-stackable feat picked (`feats`) is already on the character: picked at its other levels
 * (`pickedFeatIds`, read in the save's scope: the ids the view stands for them), granted by their class levels, or
 * granted at this one (`autoGrantedRecords`).
 */
export function checkNotTaken(
  feats: FeatRecord[],
  pickedFeatIds: string[],
  otherLevels: { id: string; klassLevelId: string }[],
  autoGrantedRecords: { featsInRule: { id: string } }[],
  rulesetData: RulesetData,
) {
  const existingFeatIds = new Set(pickedFeatIds);
  // The feats the other levels' class levels and this one grant, as the view composes them
  const grants = otherLevels.flatMap(
    (level) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(level.klassLevelId) ?? [],
  );
  for (const rec of [...grants, ...autoGrantedRecords]) existingFeatIds.add(rec.featsInRule.id);

  for (const feat of feats) {
    if (!feat.stackable && existingFeatIds.has(feat.id))
      throw new RulesError("invalid", `Non-stackable feat "${feat.name}" is already on this character`);
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
