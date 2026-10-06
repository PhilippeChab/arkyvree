import type {
  RequirementCondition,
  RequirementEntry,
  RequirementGroup,
} from "@/database/packages/dnd35/content/types.ts";
import { stripSeparators } from "@/shared/text.ts";

function check(operator: string, valueType: string) {
  return (target: string, value: string | number): RequirementCondition => ({
    target,
    operator,
    value: String(value),
    valueType,
  });
}

// Numeric
export const eqNum = check("equal", "number");
export const gte = check("greater_than_or_equal", "number");
export const lt = check("less_than", "number");

// String
export const eqStr = check("equal", "string");

// Builders the content's requirements are written with: `or(eq(feat("Dodge")), gte("combat.bab", 4))`. The
// generator writes a check with the builder that makes exactly that check (`builderOf` in generator/codegen.ts), and
// any other check as an object.

export function and(...children: RequirementEntry[]): RequirementGroup {
  return { chainingOperator: "and", children };
}

// Boolean
export function eq(target: string) {
  return check("equal", "boolean")(target, "true");
}

/** The path of having a feat. */
export function feat(name: string) {
  return `feats.${stripSeparators(name)}.possessed`;
}

export function or(...children: RequirementEntry[]): RequirementGroup {
  return { chainingOperator: "or", children };
}
