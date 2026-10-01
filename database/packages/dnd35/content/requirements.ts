import type {
  RequirementCondition,
  RequirementEntry,
  RequirementGroup,
} from "@/database/packages/dnd35/content/types.ts";
import { stripSeparators } from "@/shared/utils.ts";

// Builders the content's requirements are written with: `or(eq(feat("Dodge")), gte("combat.bab", 4))`. The
// generator writes a check with the builder that makes exactly that check (`builderOf` in generator/codegen.ts), and
// any other check as an object.

/** The path of having a feat. */
export const feat = (name: string) => `feats.${stripSeparators(name)}.possessed`;

export const or = (...children: RequirementEntry[]): RequirementGroup => ({ chainingOperator: "or", children });
export const and = (...children: RequirementEntry[]): RequirementGroup => ({ chainingOperator: "and", children });

const check =
  (operator: string, valueType: string) =>
  (target: string, value: string | number): RequirementCondition => ({
    target,
    operator,
    value: String(value),
    valueType,
  });

// Boolean
export const eq = (target: string) => check("equal", "boolean")(target, "true");

// Numeric
export const eqNum = check("equal", "number");
export const gte = check("greater_than_or_equal", "number");

// String
export const eqStr = check("equal", "string");
