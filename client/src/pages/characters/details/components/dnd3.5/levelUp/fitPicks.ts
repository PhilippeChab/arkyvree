/**
 * A level's picks as the slots its pools give have room for. The form keeps what was picked; the wizards read it
 * through these, so a pool that shrinks (another class planned, a feat that granted slots removed) drops its later
 * picks, and a step's change, made from what it shows, keeps them dropped. Until then they wait unshown: a pool that
 * grows back (the class planned again) shows them again.
 */

import type { AptitudePool, LevelUpFormData, PowerAptitudePool } from "./levelUpTypes.ts";
import { maxSkillPoints, type SkillLevels } from "./skillLevels.ts";

type Feats = LevelUpFormData["selectedFeats"];

type Powers = LevelUpFormData["selectedPowers"];

/** What the skill slots say a level's points may go to. */
interface SkillLimits {
  skillPointsToSpend: number;
  skills: { currentRank: number; id: string; isClassSkill: boolean }[];
  totalCharacterLevel: number;
}

/** The feat pools grown by the picked feats' "add" aptitude modifiers. */
function growFeatPools(aptitudePools: Record<string, AptitudePool>, feats: Feats) {
  const pools = { ...aptitudePools };
  const adjustments = new Map<string, number>();
  for (const picks of Object.values(feats)) {
    for (const feat of picks) {
      for (const mod of feat.aptitudeModifiers ?? [])
        if (mod.operator === "add") adjustments.set(mod.aptitudeId, (adjustments.get(mod.aptitudeId) ?? 0) + mod.value);
    }
  }
  for (const [aptitudeId, delta] of adjustments) {
    if (pools[aptitudeId]) {
      pools[aptitudeId] = {
        ...pools[aptitudeId],
        allowed: pools[aptitudeId].allowed + delta,
        available: pools[aptitudeId].available + delta,
      };
    }
  }
  return pools;
}

/** Each pool's picks up to its room (`roomOf`, none for a pool gone), the later ones dropped; the same picks if all fit. */
function trimPools<T>(picks: Record<string, T[]>, roomOf: (poolId: string, picks: T[]) => T[]) {
  let changed = false;
  const trimmed = Object.fromEntries(
    Object.entries(picks).map(([poolId, poolPicks]) => {
      const kept = roomOf(poolId, poolPicks);
      if (kept.length !== poolPicks.length) changed = true;
      return [poolId, kept];
    }),
  );
  return changed ? trimmed : picks;
}

/** The picked feats as the "featId:aptitudeId" list the picker endpoints take. */
export function featPickString(feats: Feats) {
  const pairs = Object.entries(feats).flatMap(([aptitudeId, picks]) => picks.map((f) => `${f.id}:${aptitudeId}`));
  return pairs.length > 0 ? pairs.sort().join(",") : undefined;
}

/**
 * The feats each pool has room for, and the pools they grow. A feat dropped takes the slots it granted with it, which
 * may drop more. Until the pools load, the picks stand.
 */
export function fitFeats(feats: Feats, aptitudePools: Record<string, AptitudePool> | undefined) {
  if (!aptitudePools) return { feats, pools: {} };
  let fitted = feats;
  for (;;) {
    const pools = growFeatPools(aptitudePools, fitted);
    const trimmed = trimPools(fitted, (poolId, picks) => picks.slice(0, Math.max(0, pools[poolId]?.available ?? 0)));
    if (trimmed === fitted) return { feats: fitted, pools };
    fitted = trimmed;
  }
}

/**
 * The spells each pool has room for: a leveled pool's at each spell level, the latest dropped first. Until the pools
 * load, the picks stand.
 */
export function fitPowers(powers: Powers, aptitudePools: Record<string, PowerAptitudePool> | undefined) {
  if (!aptitudePools) return powers;
  return trimPools(powers, (poolId, picks) => {
    const pool = aptitudePools[poolId];
    if (!pool) return [];
    if (!pool.leveled || !pool.levels) return picks.slice(0, Math.max(0, pool.available));
    const kept = [...picks];
    for (const [level, { available }] of Object.entries(pool.levels)) {
      let excess = kept.filter((p) => p.powerLevel === Number(level)).length - available;
      for (let i = kept.length - 1; i >= 0 && excess > 0; i--) {
        if (kept[i].powerLevel === Number(level)) {
          kept.splice(i, 1);
          excess--;
        }
      }
    }
    return kept;
  });
}

/**
 * The skill points each skill may take (its rank cap, the points its levels give it) within the level's total, in the
 * order they were given. Until the slots load, the points stand.
 */
export function fitSkillPoints(
  allocations: Record<string, number>,
  limits: SkillLimits | null | undefined,
  levels: SkillLevels | undefined,
) {
  if (!limits || !levels) return allocations;
  let changed = false;
  let total = 0;
  const fitted: Record<string, number> = {};
  for (const [skillId, points] of Object.entries(allocations)) {
    const skill = limits.skills.find((s) => s.id === skillId);
    if (!skill || points <= 0) {
      changed = true;
      continue;
    }
    const clamped = Math.min(
      points,
      maxSkillPoints(skill, limits.totalCharacterLevel, levels),
      limits.skillPointsToSpend - total,
    );
    if (clamped !== points) changed = true;
    if (clamped > 0) {
      fitted[skillId] = clamped;
      total += clamped;
    }
  }
  return changed ? fitted : allocations;
}

/** The pool whose feat picker is open, while it has slots: one a removed feat granted closes it. */
export function openPoolOf(aptitudeId: string | null, pools: Record<string, AptitudePool>) {
  if (!aptitudeId) return null;
  const available = pools[aptitudeId]?.available;
  return available !== undefined && available <= 0 ? null : aptitudeId;
}

/** The picks without one: a chip's delete. */
export function withoutPick<T extends { id: string }>(picks: Record<string, T[]>, aptitudeId: string, id: string) {
  return { ...picks, [aptitudeId]: (picks[aptitudeId] ?? []).filter((pick) => pick.id !== id) };
}
