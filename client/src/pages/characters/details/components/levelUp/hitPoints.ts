/** The hit points a level wizard's HP step sets: Add Level's for each planned level, Edit Level's for the edited one. */

import { wholeNumberError } from "@/client/src/lib/validation.ts";

/**
 * A level whose hit points the step sets: its class and level, the die it rolls, and the hit points it may gain, as its
 * rules answer them (`hitPoints`: the least, the most and the average).
 */
export interface HpLevel {
  className: string;
  hd: number;
  hitPoints: { average: number; max: number; min: number };
  nextLevel: number;
}

/** What's wrong with a level's hit points: a whole number within the bounds its rules answer, or nothing. */
export function hpError(value: number, level: HpLevel) {
  return wholeNumberError(value, level.hitPoints.min, level.hitPoints.max);
}

/** Whether every level has its hit points, each one right: the step's Next, and the save after it, wait for it. */
export function hpSet(levels: HpLevel[], values: (number | null)[]): values is number[] {
  return (
    levels.length > 0 &&
    levels.every((level, index) => {
      const value = values[index];
      return value != null && hpError(value, level) === undefined;
    })
  );
}
