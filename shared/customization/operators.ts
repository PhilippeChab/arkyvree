/** Shared application definitions, checked against the migrated database by tests. */

type ModifierOperator = (typeof MODIFIER_OPERATORS)[number];

type RequirementOperator = (typeof REQUIREMENT_OPERATORS)[number];

/** What an operator belongs to: a modifier's changes its target, a requirement's compares it. */
export type OperatorKind = "modifier" | "requirement";

/**
 * An operator's words, by its kind: a modifier's sign, a requirement's comparison. Every operator of the lists has
 * them: one the lists add without its words fails the type check.
 */
const OPERATOR_LABELS: {
  modifier: Record<ModifierOperator, string>;
  requirement: Record<RequirementOperator, string>;
} = {
  modifier: { add: "+", subtract: "-", multiply: "*", divide: "/", set: "=" },
  requirement: {
    equal: "==",
    not_equal: "!=",
    greater_than: ">",
    less_than: "<",
    greater_than_or_equal: ">=",
    less_than_or_equal: "<=",
    contains: "contains",
    not_contains: "does not contain",
    starts_with: "starts with",
    ends_with: "ends with",
    matches_regex: "matches pattern",
    not_matches_regex: "does not match pattern",
    is_empty: "is empty",
    not_empty: "is not empty",
  },
};

export const CHAINING_OPERATORS = ["and", "or"] as const;

export const MODIFIER_OPERATORS = ["add", "subtract", "multiply", "divide", "set"] as const;

/** The requirement operators that compare a number: what a numeric target path offers a requirement. */
export const NUMERIC_REQUIREMENT_OPERATORS = [
  "equal",
  "not_equal",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
] as const;
export const REQUIREMENT_OPERATORS = [
  ...NUMERIC_REQUIREMENT_OPERATORS,
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_regex",
  "not_matches_regex",
  "is_empty",
  "not_empty",
] as const;
/** The requirement operators that check their target alone: they compare it to no value. */
export const VALUELESS_REQUIREMENT_OPERATORS = ["is_empty", "not_empty"] as const;

/** An operator's words, as the app shows it ("+", "starts with"); one it doesn't know, as it is. */
export function formatOperator(kind: OperatorKind, operator: string): string {
  const labels: Record<string, string> = OPERATOR_LABELS[kind];
  return Object.hasOwn(labels, operator) ? labels[operator] : operator;
}

/** The operators a numeric target path offers a modifier, or a requirement. */
export function getNumericOperators(kind: OperatorKind): string[] {
  return kind === "modifier" ? [...MODIFIER_OPERATORS] : [...NUMERIC_REQUIREMENT_OPERATORS];
}

/** Whether a requirement's operator checks its target alone, with no value to compare it to. */
export function isValuelessOperator(operator: string | undefined) {
  return VALUELESS_REQUIREMENT_OPERATORS.some((valueless) => valueless === operator);
}
