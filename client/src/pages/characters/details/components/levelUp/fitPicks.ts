/**
 * A level's picks as their pools have room for, and the skill points as their levels take them. The form keeps what
 * was picked; the wizards read it through these, so a pool that shrinks (another class planned, a feat that granted
 * room removed) drops its later picks, and a step's change, made from what it shows, keeps them dropped. Until then they
 * wait unshown: a pool that grows back (the class planned again) shows them again. The ruleset's answers say what fits
 * (`fitted`): the engine fits the picks to their pools, as a save would take them.
 */

/** A skill as an answer spends the points on it: its ranks at each count of points, up to the most it keeps. */
export interface SpentSkill {
  id: string;
  ranksByPoints: number[];
}

/**
 * The skill points the form gave each skill, as the answer spends them: each up to the most it keeps whole as the save
 * spreads them (its `ranksByPoints`), in the order they were given. Until the answer loads, the points stand.
 */
export function fitSkillPoints(allocations: Record<string, number>, skills: SpentSkill[] | undefined) {
  if (!skills) return allocations;
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  let changed = false;
  const fitted: Record<string, number> = {};
  for (const [skillId, points] of Object.entries(allocations)) {
    const skill = byId.get(skillId);
    const kept = skill ? Math.min(points, skill.ranksByPoints.length - 1) : 0;
    if (kept !== points) changed = true;
    if (kept > 0) fitted[skillId] = kept;
  }
  return changed ? fitted : allocations;
}

/**
 * The picks an answer says fit (`fitted`: each pool's ids, as the engine fits them), each the form's own pick, in its
 * order; the same picks if all fit. Until an answer is for these picks, they stand.
 */
export function keepFitted<T extends { id: string }>(
  picks: Record<string, T[]>,
  fitted: Record<string, string[]> | undefined,
) {
  if (!fitted) return picks;
  let changed = false;
  const kept = Object.fromEntries(
    Object.entries(picks).map(([poolId, poolPicks]) => {
      // Each id as often as the answer keeps it: a stackable feat picked twice twice, another pick given twice once
      const left = [...(fitted[poolId] ?? [])];
      const fits = poolPicks.filter((pick) => {
        const index = left.indexOf(pick.id);
        if (index >= 0) left.splice(index, 1);
        return index >= 0;
      });
      if (fits.length !== poolPicks.length) changed = true;
      return [poolId, fits];
    }),
  );
  return changed ? kept : picks;
}

/** The pool whose feat picker is open, while it has slots: one a removed feat granted closes it. */
export function openPoolOf(aptitudeId: string | null, pools: Record<string, { available: number }>) {
  if (!aptitudeId) return null;
  const available = pools[aptitudeId]?.available;
  return available !== undefined && available <= 0 ? null : aptitudeId;
}

/** The picks without one of `id`, its last (a stackable feat picked twice keeps the other): a chip's delete. */
export function withoutPick<T extends { id: string }>(picks: Record<string, T[]>, aptitudeId: string, id: string) {
  const poolPicks = picks[aptitudeId] ?? [];
  const index = poolPicks.findLastIndex((pick) => pick.id === id);
  return { ...picks, [aptitudeId]: index === -1 ? poolPicks : poolPicks.toSpliced(index, 1) };
}

/** The picks with one more, last in its pool: an option's click. */
export function withPick<T>(picks: Record<string, T[]>, aptitudeId: string, pick: T) {
  return { ...picks, [aptitudeId]: [...(picks[aptitudeId] ?? []), pick] };
}
