/**
 * A level's picks as their pools have room for, and the points as their advancements take them. The form keeps what
 * was picked; the wizards read it through these, so a pool that shrinks (another track planned, a pick that granted
 * room removed) drops its later picks, and a step's change, made from what it shows, keeps them dropped. Until then they
 * wait unshown: a pool that grows back (the track planned again) shows them again. The ruleset's answers say what fits
 * (`fitted`): the engine fits the picks to their pools, as a save would take them.
 */

import type { AnswerOf, LevelStep, PlanAnswer } from "./levelPlanQueries.ts";
import type { LevelPlanForm } from "./planRequest.ts";

/** A row as a `spend` answer spends the points on it: its value at each count of points, up to the most it keeps. */
export interface SpentRow {
  id: string;
  valuesByPoints: number[];
}

/**
 * The form's picks and points as the plan's answer (`answer`) fits them, by step: each `pick` step's picks its pools
 * have room for, each `spend` step's points its rows keep. Until an answer is for these picks (none while it's for
 * earlier ones), they stand.
 */
export function fitPlan(
  steps: readonly LevelStep[],
  form: LevelPlanForm,
  answer: PlanAnswer | undefined,
): LevelPlanForm {
  if (!answer) return form;
  let picks = form.picks;
  let points = form.points;
  for (const step of steps) {
    // A step given nothing yet has nothing to fit
    const stepAnswer = answer.steps[step.name];
    const stepPicks = form.picks[step.name];
    if (step.mechanic === "pick" && stepAnswer?.mechanic === "pick" && stepPicks) {
      const fitted = keepFitted(stepPicks, stepAnswer.fitted);
      if (fitted !== stepPicks) picks = { ...picks, [step.name]: fitted };
    }
    const stepPoints = form.points[step.name];
    if (step.mechanic === "spend" && stepAnswer?.mechanic === "spend" && stepPoints) {
      const fitted = fitPoints(stepPoints, (stepAnswer as AnswerOf<"spend">).rows);
      if (fitted !== stepPoints) points = { ...points, [step.name]: fitted };
    }
  }
  return picks === form.picks && points === form.points ? form : { ...form, picks, points };
}

/**
 * The points the form gave each row, as the answer spends them: each up to the most it keeps whole as the save spreads
 * them (its `valuesByPoints`), in the order they were given. Until the answer loads, the points stand.
 */
export function fitPoints(points: Record<string, number>, rows: SpentRow[] | undefined) {
  if (!rows) return points;
  const byId = new Map(rows.map((row) => [row.id, row]));
  let changed = false;
  const fitted: Record<string, number> = {};
  for (const [rowId, spent] of Object.entries(points)) {
    const row = byId.get(rowId);
    const kept = row ? Math.min(spent, row.valuesByPoints.length - 1) : 0;
    if (kept !== spent) changed = true;
    if (kept > 0) fitted[rowId] = kept;
  }
  return changed ? fitted : points;
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

/** The picks without one of `id`, its last (a stackable pick taken twice keeps the other): a chip's delete. */
export function withoutPick<T extends { id: string }>(picks: Record<string, T[]>, poolId: string, id: string) {
  const poolPicks = picks[poolId] ?? [];
  const index = poolPicks.findLastIndex((pick) => pick.id === id);
  return { ...picks, [poolId]: index === -1 ? poolPicks : poolPicks.toSpliced(index, 1) };
}

/** The picks with one more, last in its pool: an option's click. */
export function withPick<T>(picks: Record<string, T[]>, poolId: string, pick: T) {
  return { ...picks, [poolId]: [...(picks[poolId] ?? []), pick] };
}
