import type {
  RequirementCondition,
  RequirementEntry,
  RequirementGroup,
} from "@/database/packages/dnd35/content/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A check of `target` against `value`, by `operator`, `value` read as `valueType`. */
function condition(target: string, operator: string, value: string | number, valueType: string): RequirementCondition {
  return { target, operator, value: String(value), valueType };
}

// Numeric
export function eqNum(target: string, value: string | number): RequirementCondition {
  return condition(target, "equal", value, "number");
}

// String
export function eqStr(target: string, value: string | number): RequirementCondition {
  return condition(target, "equal", value, "string");
}

export function gte(target: string, value: string | number): RequirementCondition {
  return condition(target, "greater_than_or_equal", value, "number");
}

export function lt(target: string, value: string | number): RequirementCondition {
  return condition(target, "less_than", value, "number");
}

// Builders the content's requirements are written with: `or(eq(feat("Dodge")), gte("combat.bab", 4))`. The
// generator writes a check with the builder that makes exactly that check (`builderOf` in generator/codegen.ts), and
// any other check as an object.

export function and(...children: RequirementEntry[]): RequirementGroup {
  return { chainingOperator: "and", children };
}

// Boolean
export function eq(target: string) {
  return condition(target, "equal", "true", "boolean");
}

/** The path of having a feat. */
export function feat(name: string) {
  return `feats.${stripSeparators(name)}.possessed`;
}

export function or(...children: RequirementEntry[]): RequirementGroup {
  return { chainingOperator: "or", children };
}
