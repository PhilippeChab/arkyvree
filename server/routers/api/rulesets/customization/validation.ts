import { z } from "zod";
import { CHAINING_OPERATORS, MODIFIER_OPERATORS, REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";

const requirementOperators = new Set<string>(REQUIREMENT_OPERATORS);
const modifierOperators = new Set<string>(MODIFIER_OPERATORS);
const chainingOperators = new Set<string>(CHAINING_OPERATORS);

// Keep RPC input types as strings, matching the existing form schemas.
export const requirementOperator = z.string().refine(
  (value) => requirementOperators.has(value), "Invalid requirement operator",
);
export const modifierOperator = z.string().refine(
  (value) => modifierOperators.has(value), "Invalid modifier operator",
);
export const chainingOperator = z.string().refine(
  (value) => chainingOperators.has(value), "Invalid chaining operator",
);
