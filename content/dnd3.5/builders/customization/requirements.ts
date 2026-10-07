/**
 * Builders the content's requirements are written with: `or(eq(feat("Dodge")), gte("combat.bab", 4))`. The generator
 * writes a check with the builder that makes exactly that check (`CodeFile.builderOf`, in the parser's generator), and
 * any other check as an object.
 */

import { stripSeparators } from "@/shared/text.ts";

import type { RequirementCondition, RequirementEntry, RequirementGroup } from "./types.ts";

/** A check of `target` against `value`, by `operator`, `value` read as `valueType`. */
function condition(target: string, operator: string, value: string | number, valueType: string): RequirementCondition {
  return { target, operator, value: String(value), valueType };
}

/** Every one of `children`. */
export function and(...children: RequirementEntry[]): RequirementGroup {
  return { chainingOperator: "and", children };
}

/** `target` true: a feat possessed, a property held. */
export function eq(target: string): RequirementCondition {
  return condition(target, "equal", "true", "boolean");
}

/** `target` equal to the number `value`. */
export function eqNum(target: string, value: string | number): RequirementCondition {
  return condition(target, "equal", value, "number");
}

/** `target` equal to the text `value`. */
export function eqStr(target: string, value: string | number): RequirementCondition {
  return condition(target, "equal", value, "string");
}

/** The path of having a feat. */
export function feat(name: string): string {
  return `feats.${stripSeparators(name)}.possessed`;
}

/** `target` above the number `value`. */
export function gt(target: string, value: string | number): RequirementCondition {
  return condition(target, "greater_than", value, "number");
}

/** `target` at least the number `value`. */
export function gte(target: string, value: string | number): RequirementCondition {
  return condition(target, "greater_than_or_equal", value, "number");
}

/** `target` below the number `value`. */
export function lt(target: string, value: string | number): RequirementCondition {
  return condition(target, "less_than", value, "number");
}

/** Any one of `children`. */
export function or(...children: RequirementEntry[]): RequirementGroup {
  return { chainingOperator: "or", children };
}
