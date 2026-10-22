/** A `value` step's values: each advancement's, within the bounds its answer gives (3.5's hit points). */

import { wholeNumberError } from "@/client/src/lib/validation.ts";

import type { PlannedSlot } from "./planRequest.ts";

/** An advancement's value's bounds, as a `value` step's answer gives them: the least, the most, and the average. */
interface ValueBounds {
  average: number;
  max: number;
  min: number;
}

/** What's wrong with an advancement's value: a whole number within its bounds, or nothing. */
export function valueError(value: number, bounds: ValueBounds) {
  return wholeNumberError(value, bounds.min, bounds.max);
}

/**
 * Whether every advancement (`slots`) has its value (`values`, by slot key), each within its bounds (`bounds`, by the
 * advancement's index): the step's Next, and the save after it, wait for it. None set until its answer's bounds load.
 */
export function valuesSet(
  bounds: readonly ValueBounds[] | undefined,
  slots: readonly PlannedSlot[],
  values: Readonly<Record<number, number | null>> | undefined,
) {
  return (
    !!bounds &&
    slots.length > 0 &&
    slots.every(({ key }, index) => {
      const value = values?.[key];
      const bound = bounds[index];
      return value != null && !!bound && valueError(value, bound) === undefined;
    })
  );
}
