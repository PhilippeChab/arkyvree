import { z } from "zod";

const requirementOperators = new Set([
  "equal", "not_equal", "greater_than", "less_than", "greater_than_or_equal",
  "less_than_or_equal", "contains", "not_contains", "starts_with", "ends_with",
  "matches_regex", "not_matches_regex", "is_empty", "not_empty",
]);
const modifierOperators = new Set(["add", "subtract", "multiply", "divide", "set"]);

// Keep RPC input types as strings, matching the existing form schemas.
export const requirementOperator = z.string().refine(
  (value) => requirementOperators.has(value), "Invalid requirement operator",
);
export const modifierOperator = z.string().refine(
  (value) => modifierOperators.has(value), "Invalid modifier operator",
);
export const chainingOperator = z.string().refine(
  (value) => value === "and" || value === "or", "Invalid chaining operator",
);
