import { Dnd35LevelsHooks } from "@/server/rulesets/dnd3.5/levels/LevelsHooks.ts";

import type { BondedRaceStatBlock } from "./bondedRaceData.ts";

/**
 * A creature's feats at its total hit dice: as many as the Monster Manual gives, one at the first hit die and one more
 * every third (`Dnd35LevelsHooks.countGeneralFeats`, a character's general feats' rule). Its stat block's base feats,
 * then enough of its `featPriority`, in order, to reach that count.
 */
export function scaleFeats(stats: BondedRaceStatBlock, totalHD: number): string[] {
  const count = Dnd35LevelsHooks.countGeneralFeats(Math.max(1, totalHD));
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
