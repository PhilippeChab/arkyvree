/** The rules a modifier's or a requirement's condition holds its target, its operator and its value to. */

import { requiredRules } from "@/client/src/lib/validation.ts";
import { isValuelessOperator } from "@/shared/customization/operators.ts";

/** A condition's operator. */
export const CONDITION_OPERATOR_RULES = requiredRules("Operator is required");

/** A condition's target: the path it reads or changes. */
export const CONDITION_TARGET_RULES = requiredRules("Target is required");

/** A modifier's value: what it changes its target by. */
export const MODIFIER_VALUE_RULES = requiredRules("Value is required");

/** A requirement's value, but under an operator that checks its target alone (is empty, is not empty). */
export const REQUIREMENT_VALUE_RULES = {
  validate: (value: unknown, form: { operator?: string }) =>
    isValuelessOperator(form.operator) || (typeof value === "string" && value !== "") || "Value is required",
};
