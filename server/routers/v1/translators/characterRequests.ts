/**
 * A v1 write of a character's parts, as its service takes it: an inventory entry's charges apart, and a level's picks
 * grouped by the aptitude they're picked in, its spells the service's powers.
 */

/** A level's picks as v1 sends them: each its feat or its spell, and the aptitude it's picked in. */
interface LevelPicks {
  abilityIncreases: { abilityId: string; amount: number }[];
  feats: { aptitudeId: string; featId: string }[];
  force: boolean;
  hitPoints: number;
  skillPoints: Record<string, number>;
  spells: { aptitudeId: string; spellId: string }[];
}

/** Picks grouped by the aptitude they're picked in, as the level saves take them. */
function groupByAptitude<K extends "featId" | "spellId">(
  picks: ({ aptitudeId: string } & Record<K, string>)[],
  key: K,
) {
  const grouped: Record<string, string[]> = {};
  for (const pick of picks) (grouped[pick.aptitudeId] ??= []).push(pick[key]);
  return grouped;
}

/** An inventory entry's write, its charges the service's own two numbers. */
export function toInventoryRequest<T extends { charges?: { remaining: number | null; total: number | null } | null }>({
  charges,
  ...body
}: T) {
  return { ...body, remainingCharges: charges?.remaining ?? null, totalCharges: charges?.total ?? null };
}

/** A saved level's edit, as the levels' service takes it: its picks by aptitude. */
export function toLevelEditRequest({ abilityIncreases, feats, force, hitPoints, skillPoints, spells }: LevelPicks) {
  return {
    abilityIncreases,
    feats: groupByAptitude(feats, "featId"),
    force,
    hp: hitPoints,
    powers: groupByAptitude(spells, "spellId"),
    skills: skillPoints,
  };
}

/** A new level's save, as the levels' service takes a level-up of one level: its class, and its picks by aptitude. */
export function toLevelSaveRequest({ classId, level, ...picks }: LevelPicks & { classId: string; level: number }) {
  const { abilityIncreases, hp, ...rest } = toLevelEditRequest(picks);
  return { ...rest, levels: [{ abilityIncreases, hp, klassId: classId, level }] };
}
