/** A reference's text checked against the fixed set of options the seed accepts. */

import { isOneOf } from "@/shared/isOneOf.ts";

/** A reference's text checked against the fixed set the seed accepts: the option it is, or why it isn't one. */
export type Checked<T> = { ok: true; value: T } | { ok: false; problem: string };

/** `value` checked against `options`: `what` names it in the problem. */
export function checkOneOf<T extends string>(value: string, options: readonly T[], what: string): Checked<T> {
  return isOneOf(value, options)
    ? { ok: true, value }
    : { ok: false, problem: `${what}: "${value}" isn't one of ${options.join(", ")}` };
}

/** A checked value, for the seed: its problem throws. */
export function getCheckedValue<T>(checked: Checked<T>): T {
  if (!checked.ok) throw new Error(checked.problem);
  return checked.value;
}
