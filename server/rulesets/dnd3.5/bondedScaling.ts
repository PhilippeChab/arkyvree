import type { BondedRaceStatBlock } from "./bondedRaceData.ts";

/**
 * Feat list at the given total HD, per the MM monster-advancement formula
 * `1 + floor((HD-1)/3)`. Returns baseFeats plus enough items from
 * featPriority (in order) to reach the target count.
 */
export function scaledFeats(stats: BondedRaceStatBlock, totalHD: number): string[] {
  const count = 1 + Math.floor((Math.max(1, totalHD) - 1) / 3);
  const base = stats.baseFeats ?? [];
  const priority = stats.featPriority ?? [];
  const extras = priority.slice(0, Math.max(0, count - base.length));
  return [...base, ...extras];
}

/**
 * Per-skill total bonuses at the given total HD. Starts from baseSkillTotals
 * (SRD stat-block numbers), then bumps each `skillPriority` skill by +1 per
 * pass as the bonded gains HD beyond its baseHD. Each skill is capped at
 * HD + 3 (the standard "max ranks" line, applied here as a soft ceiling on
 * the total bonus).
 */
export function scaledSkillTotals(stats: BondedRaceStatBlock, totalHD: number): Record<string, number> {
  const totals: Record<string, number> = { ...(stats.baseSkillTotals ?? {}) };
  const priority = stats.skillPriority ?? [];
  const cap = totalHD + 3;

  for (const skill of Object.keys(totals)) {
    if (totals[skill] > cap) totals[skill] = cap;
  }

  let pool = Math.max(0, totalHD - stats.baseHD);
  if (priority.length === 0 || pool === 0) return totals;

  let i = 0;
  let stallGuard = 0;
  while (pool > 0 && stallGuard < priority.length) {
    const skill = priority[i % priority.length];
    const current = totals[skill] ?? 0;
    if (current < cap) {
      totals[skill] = current + 1;
      pool--;
      stallGuard = 0;
    } else {
      stallGuard++;
    }
    i++;
  }
  return totals;
}
