/**
 * What a level wizard's pickers check their options against, as the endpoints take it: the picks so far, and the levels
 * Add Level plans before the pick, not saved yet. Both wizards' class, feat and spell pickers encode them here, once.
 */

import type { PickerLevel } from "./levelUpQueries.ts";
import type { LevelUpFormData, PreviewLevelDetail } from "./levelUpTypes.ts";

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
 * The planned level a pool's next pick lands on, as the save hands a pool's picks out over its slots (`slotsPerLevel`,
 * in plan order): the first level whose slots so far outnumber the `picked`, the last once they're all taken.
 */
export function nextPickLevel(slotsPerLevel: number[], picked: number) {
  let slots = 0;
  for (const [index, levelSlots] of slotsPerLevel.entries()) {
    slots += levelSlots;
    if (slots > picked) return index;
  }
  return Math.max(0, slotsPerLevel.length - 1);
}

/**
 * The first `count` planned levels (all of them when it's left out), as their preview lists them: their class levels
 * and their ability increases, by the level's place in the plan. None before the preview has loaded.
 */
export function pendingLevelsOf(
  levelDetails: { klassLevelId: string }[] | undefined,
  abilityIncreases: (string | null)[],
  count?: number,
): PendingLevels {
  const levels = levelDetails?.slice(0, count) ?? [];
  if (levels.length === 0) return { pendingAbilityIds: undefined, pendingKlassLevelIds: undefined };
  return {
    pendingAbilityIds: levels.map((_, i) => abilityIncreases[i] ?? "null").join(","),
    pendingKlassLevelIds: levels.map((level) => level.klassLevelId).join(","),
  };
}

/**
 * Add Level's picker at the planned level its next pick lands on (`index`, `nextPickLevel`'s): that level's class and
 * level, the planned levels up to it, and the feats picked so far, none of them saved yet. Nothing until the plan's
 * preview has loaded, which skips the picker's query.
 */
export function plannedPicker(
  levelDetails: Pick<PreviewLevelDetail, "klassId" | "klassLevelId" | "level">[] | undefined,
  abilityIncreases: (string | null)[],
  index: number,
  featPicks: string | undefined,
): PickerLevel {
  const detail = levelDetails?.[index];
  return {
    classId: detail?.klassId,
    level: detail?.level,
    selectedFeatPicks: featPicks,
    ...pendingLevelsOf(levelDetails, abilityIncreases, index + 1),
    // None of the picks is saved yet: they're all pending
    pendingFeatPicks: featPicks,
  };
}

/** The skill points spent so far as the "skillId:points" list the class picker takes. */
export function skillPointString(allocations: LevelUpFormData["skillPointAllocations"]) {
  const pairs = Object.entries(allocations)
    .filter(([, points]) => points > 0)
    .map(([skillId, points]) => `${skillId}:${points}`);
  return pairs.length > 0 ? pairs.join(",") : undefined;
}

/**
 * A spell pool's slots at each planned level (`slotsPerLevel`, by spell level): at the open spell level, or every
 * level's together for a pool without spell levels (`null`), as the save hands its picks out.
 */
export function spellSlotsPerLevel(slotsPerLevel: Record<string, number>[], spellLevel: number | null) {
  return slotsPerLevel.map((slots) =>
    spellLevel === null ? Object.values(slots).reduce((sum, count) => sum + count, 0) : (slots[spellLevel] ?? 0),
  );
}
