import type { BondedRaceStatBlock } from "./bondedRaceData.ts";

/**
 * Feat list at the given total HD, per the MM monster-advancement formula
 * `1 + floor((HD-1)/3)`. Returns baseFeats plus enough items from
 * featPriority (in order) to reach the target count.
 */
export function scaleFeats(stats: BondedRaceStatBlock, totalHD: number): string[] {
  const count = 1 + Math.floor((Math.max(1, totalHD) - 1) / 3);
  const base = stats.baseFeats ?? [];
  const priority = stats.featPriority ?? [];
  const extras = priority.slice(0, Math.max(0, count - base.length));
  return [...base, ...extras];
}

/**
 * The ranks a creature's hit dice past its stat block's give its skills: an animal's skill point per added hit die (2 +
 * its Intelligence modifier, at least 1, and an animal's Intelligence of 1 or 2 makes it 1), each to the next skill of
 * its `skillPriority` in turn. A legal stat block has at most its hit dice + 3 ranks in a skill, and a skill gains at
 * most a rank per added hit die, so none passes the maximum.
 */
export function scaleSkillRanks(stats: BondedRaceStatBlock, totalHD: number): Record<string, number> {
  const ranks: Record<string, number> = {};
  const priority = stats.skillPriority ?? [];
  if (priority.length === 0) return ranks;
  const points = Math.max(0, totalHD - stats.baseHD);
  for (let point = 0; point < points; point++) {
    const skill = priority[point % priority.length];
    ranks[skill] = (ranks[skill] ?? 0) + 1;
  }
  return ranks;
}
