/**
 * Builders any ruleset's content writes its modifiers with, as it writes its requirements with `requirements.ts`'s:
 * rows of a target, an operator and a value, whatever the ruleset's paths name.
 */

import type { Modifier } from "./types.ts";

/** `target` changed by `operator` to `value`, read as `valueType`. */
function modifier(target: string, operator: string, value: string | number, valueType: string): Modifier {
  return { target, operator, value: String(value), valueType };
}

/** `value` added to `target`: a number, or a formula giving one (`{{ [classes.wizard.level] }}`). */
export function bonus(target: string, value: number | string): Modifier {
  return modifier(target, "add", value, "number");
}

/** `target` set true: a flag (an innate class skill, a spell list joining a class's). */
export function setFlag(target: string): Modifier {
  return modifier(target, "set", "true", "boolean");
}

/** `target` set to the number `value`. */
export function setNum(target: string, value: number | string): Modifier {
  return modifier(target, "set", value, "number");
}

/** `target` set to the text `value`. */
export function setStr(target: string, value: string): Modifier {
  return modifier(target, "set", value, "string");
}
