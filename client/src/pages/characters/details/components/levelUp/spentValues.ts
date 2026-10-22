/**
 * A `spend` step's row's value as its answer gives it (`valuesByPoints`: its value at each count of points from 0, up to
 * the most it keeps): what the step and the review show the points spent come to, and the points its value field asks
 * for. The step answers them as the save spreads the points, so they're looked up here, never worked out.
 */

import type { SpentRow } from "./fitPicks.ts";

/** The most points whose value doesn't pass `value`: what a value field typed asks for. */
export function pointsAt(row: Pick<SpentRow, "valuesByPoints">, value: number) {
  const { valuesByPoints } = row;
  for (let points = valuesByPoints.length - 1; points > 0; points--) if (valuesByPoints[points] <= value) return points;
  return 0;
}

/** The value `points` buy the row: its answer's at that count, or at the most it keeps. */
export function valueAt(row: Pick<SpentRow, "valuesByPoints">, points: number) {
  const { valuesByPoints } = row;
  return valuesByPoints[Math.min(points, valuesByPoints.length - 1)] ?? 0;
}
