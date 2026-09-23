// Shared application definitions, checked against the migrated database by tests.
export const REQUIREMENT_OPERATORS = [
  "equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal",
  "less_than_or_equal", "contains", "not_contains", "starts_with", "ends_with",
  "matches_regex", "not_matches_regex", "is_empty", "not_empty",
] as const;

export const MODIFIER_OPERATORS = ["add", "subtract", "multiply", "divide", "set"] as const;
export const CHAINING_OPERATORS = ["and", "or"] as const;
