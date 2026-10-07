/** Builders the content's modifiers are written with, as its requirements are with `requirements.ts`'s. */

import { feat } from "./requirements.ts";
import type { Modifier } from "./types.ts";

/** `target` changed by `operator` to `value`, read as `valueType`. */
function modifier(target: string, operator: string, value: string | number, valueType: string): Modifier {
  return { target, operator, value: String(value), valueType };
}

/** `value` added to `target`: a number, or a formula giving one (`{{ [classes.wizard.level] }}`). */
export function bonus(target: string, value: number | string): Modifier {
  return modifier(target, "add", value, "number");
}

/** The feat `name` possessed: what a race, a class or another feat grants. */
export function grantFeat(name: string): Modifier {
  return setFlag(feat(name));
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
