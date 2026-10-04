import { z } from "zod";

import { buildEntityTypeSchema } from "@/server/routers/api/validation.ts";
import { CUSTOMIZABLE_ENTITY_TYPES, CUSTOMIZATION_OWNER_TYPES } from "@/shared/customization/entities.ts";
import { CHAINING_OPERATORS, MODIFIER_OPERATORS, REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";

const requirementOperators = new Set<string>(REQUIREMENT_OPERATORS);
const modifierOperators = new Set<string>(MODIFIER_OPERATORS);
const chainingOperators = new Set<string>(CHAINING_OPERATORS);

// Keep RPC input types as strings, matching the existing form schemas.
export const requirementOperator = z
  .string()
  .refine((value) => requirementOperators.has(value), "Invalid requirement operator");
export const modifierOperator = z.string().refine((value) => modifierOperators.has(value), "Invalid modifier operator");
export const chainingOperator = z.string().refine((value) => chainingOperators.has(value), "Invalid chaining operator");

/** A customization route's entity: the ruleset (`id`), and the entity by its type and id. */
export const entityParams = z.object({
  id: z.string().uuid(),
  entityType: buildEntityTypeSchema(CUSTOMIZABLE_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

/** As `entityParams`, for the customizations a modifier can own too (its requirements). */
export const ownerParams = entityParams.extend({ entityType: buildEntityTypeSchema(CUSTOMIZATION_OWNER_TYPES) });
