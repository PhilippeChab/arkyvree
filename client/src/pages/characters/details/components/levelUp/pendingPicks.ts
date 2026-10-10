/**
 * What a level wizard's pickers check their options against, as the endpoints take it: the picks so far, and the levels
 * Add Level plans before the pick, not saved yet. Both wizards' class, feat and spell pickers encode them here, once,
 * and a level's ability increase, which the saves send too.
 */

import type { PickerLevel } from "./levelUpQueries.ts";
import type { LevelUpFormData } from "./useLevelWizardBase.ts";

/** The planned levels before a pick, as a picker's query sends them. */
export interface PlannedLevels {
  /** Each level's ability increases (`abilityIncreaseString`), empty for none: one per class level, paired by index. */
  plannedAbilityIncreases: string | undefined;
  plannedClassLevelIds: string | undefined;
}

/** A level's ability increase as the endpoints take it: the ability the wizard picked, raised by 1, or none. */
export function abilityIncreasesOf(abilityId: string | null | undefined) {
  return abilityId ? [{ abilityId, amount: 1 }] : [];
}

/** A level's ability increase as the step and picker endpoints take it ("abilityId:amount" pairs, joined by ";"). */
export function abilityIncreaseString(abilityId: string | null | undefined) {
  return abilityIncreasesOf(abilityId)
    .map((increase) => `${increase.abilityId}:${increase.amount}`)
    .join(";");
}

/** The picked feats as the "featId:aptitudeId" list the picker endpoints take. */
export function featPickString(feats: LevelUpFormData["selectedFeats"]) {
  const pairs = Object.entries(feats).flatMap(([aptitudeId, picks]) => picks.map((f) => `${f.id}:${aptitudeId}`));
  return pairs.length > 0 ? pairs.sort().join(",") : undefined;
}

/**
 * A level's feats or powers as a step takes them, to fit them to their pools: "id:aptitudeId" pairs, every pool's, in
 * the order they were picked, which a pool that's over drops the latest of.
 */
export function pickPairString(picks: Record<string, { id: string }[]>) {
  const pairs = Object.entries(picks).flatMap(([aptitudeId, poolPicks]) =>
    poolPicks.map((pick) => `${pick.id}:${aptitudeId}`),
  );
  return pairs.length > 0 ? pairs.join(",") : undefined;
}

/**
 * The first `count` planned levels (all of them when it's left out), as their preview lists them: their class levels
 * and their ability increases, by the level's place in the plan. None before the preview has loaded.
 */
export function plannedLevelsOf(
  levelDetails: { klassLevelId: string }[] | undefined,
  abilityIncreases: (string | null)[],
  count?: number,
): PlannedLevels {
  const levels = levelDetails?.slice(0, count) ?? [];
  if (levels.length === 0) return { plannedAbilityIncreases: undefined, plannedClassLevelIds: undefined };
  return {
    plannedAbilityIncreases: levels.map((_, i) => abilityIncreaseString(abilityIncreases[i])).join(","),
    plannedClassLevelIds: levels.map((level) => level.klassLevelId).join(","),
  };
}

/**
 * Add Level's picker at the planned level its next pick lands on (`index`, the preview's `nextPickLevels`): that level's class,
 * level and ability increase, the planned levels before it, and the feats picked so far, none of them saved yet.
 * Nothing until the plan's preview has loaded, which skips the picker's query.
 */
export function plannedPicker(
  levelDetails: { klassId: string; klassLevelId: string; level: number }[] | undefined,
  abilityIncreases: (string | null)[],
  index: number,
  featPicks: string | undefined,
): PickerLevel {
  const detail = levelDetails?.[index];
  return {
    abilityId: abilityIncreases[index] ?? undefined,
    classId: detail?.klassId,
    level: detail?.level,
    featPicks,
    ...plannedLevelsOf(levelDetails, abilityIncreases, index),
  };
}

/** The picked spells' ids, every pool's, as the spell picker leaves them out ("id,id"). */
export function powerPickString(powers: LevelUpFormData["selectedPowers"]) {
  const ids = Object.values(powers).flatMap((picks) => picks.map((power) => power.id));
  return ids.length > 0 ? ids.sort().join(",") : undefined;
}

/** The skill points spent so far as the "skillId:points" list the class picker takes. */
export function skillPointString(allocations: LevelUpFormData["skillPointAllocations"]) {
  const pairs = Object.entries(allocations)
    .filter(([, points]) => points > 0)
    .map(([skillId, points]) => `${skillId}:${points}`);
  return pairs.length > 0 ? pairs.join(",") : undefined;
}
