import { stripSeparators } from "@/shared/utils.ts";
import type { RequirementCondition, RequirementEntry, RequirementGroup } from "@/database/packages/dnd35/content/types.ts";

// Builders the content's requirements are written with: `or(eq(feat("Dodge")), gte("combat.bab", 4))`. The
// generator writes a requirement with the one for its operator and type (`collectImportsFromReq`).

/** The path of having a feat. */
export const feat = (name: string) => `feats.${stripSeparators(name)}.possessed`;

export const or = (...children: RequirementEntry[]): RequirementGroup => ({ chainingOperator: "or", children });
export const and = (...children: RequirementEntry[]): RequirementGroup => ({ chainingOperator: "and", children });

const check = (operator: string, valueType: string) => (target: string, value: string | number): RequirementCondition =>
  ({ target, operator, value: String(value), valueType });

// Boolean
export const eq = (target: string) => check("equal", "boolean")(target, "true");
export const ne = (target: string) => check("not_equal", "boolean")(target, "true");

// Numeric
export const eqNum = check("equal", "number");
export const neNum = check("not_equal", "number");
export const gt = check("greater_than", "number");
export const lt = check("less_than", "number");
export const gte = check("greater_than_or_equal", "number");
export const lte = check("less_than_or_equal", "number");

// String
export const eqStr = check("equal", "string");
export const neStr = check("not_equal", "string");
