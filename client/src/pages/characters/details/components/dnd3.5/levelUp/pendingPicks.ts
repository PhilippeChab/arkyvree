/**
 * What a level wizard's pickers check their options against, as the endpoints take it: the picks so far, and the levels
 * Add Level plans before the pick, not saved yet. Both wizards' class, feat and spell pickers encode them here, once.
 */

import type { LevelUpFormData } from "./levelUpTypes.ts";

/** The planned levels before a pick, as a picker's query sends them. */
interface PendingLevels {
  /** Each level's ability increase, "null" for none: one per class level, paired by index. */
  pendingAbilityIds: string | undefined;
  pendingKlassLevelIds: string | undefined;
}

/** The picked feats as the "featId:aptitudeId" list the picker endpoints take. */
export function featPickString(feats: LevelUpFormData["selectedFeats"]) {
  const pairs = Object.entries(feats).flatMap(([aptitudeId, picks]) => picks.map((f) => `${f.id}:${aptitudeId}`));
  return pairs.length > 0 ? pairs.sort().join(",") : undefined;
}

/**
 * The first `count` planned levels (all of them when it's left out), as their preview lists them: their class levels
 * and their ability increases, by the level's place in the plan. None before the preview has loaded.
 */
export function pendingLevelsOf(
  levelDetails: { klassLevelId: string }[] | undefined,
  abilityIncreases: Record<number, string | null>,
  count?: number,
): PendingLevels {
  const levels = levelDetails?.slice(0, count) ?? [];
  if (levels.length === 0) return { pendingAbilityIds: undefined, pendingKlassLevelIds: undefined };
  return {
    pendingAbilityIds: levels.map((_, i) => abilityIncreases[i] ?? "null").join(","),
    pendingKlassLevelIds: levels.map((level) => level.klassLevelId).join(","),
  };
}

/** The skill points spent so far as the "skillId:points" list the class picker takes. */
export function skillPointString(allocations: LevelUpFormData["skillPointAllocations"]) {
  const pairs = Object.entries(allocations)
    .filter(([, points]) => points > 0)
    .map(([skillId, points]) => `${skillId}:${points}`);
  return pairs.length > 0 ? pairs.join(",") : undefined;
}
