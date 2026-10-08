/** The hit points a level wizard's HP step sets: Add Level's for each planned level, Edit Level's for the edited one. */

import { wholeNumberError } from "@/client/src/lib/validation.ts";

/** A level whose hit points the step sets: its class and level, and the die it rolls. */
export interface HpLevel {
  className: string;
  hd: number;
  nextLevel: number;
}

/** What's wrong with a level's hit points: a whole number from 1 to its die, or nothing. */
export function hpError(value: number, level: HpLevel) {
  return wholeNumberError(value, 1, level.hd);
}

/** Whether every level has its hit points, each one right: the step's Next waits for it. */
export function hpSet(levels: HpLevel[], values: (number | null)[]) {
  return (
    levels.length > 0 &&
    levels.every((level, index) => {
      const value = values[index];
      return value != null && hpError(value, level) === undefined;
    })
  );
}
