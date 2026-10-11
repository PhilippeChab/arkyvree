/**
 * A modifier's, a property's and a requirement's form, empty: what a create dialog opens on, and an edit dialog's until
 * it's reset.
 */

import type { ModifierFormData } from "./ModifierFormFields.tsx";
import type { PropertyFormData } from "./PropertyFormFields.tsx";
import type { RequirementFormData } from "./RequirementFormFields.tsx";

export const EMPTY_MODIFIER: ModifierFormData = { target: "", operator: "", value: "" };

export const EMPTY_PROPERTY: PropertyFormData = { type: "", value: "", description: "" };

/** Its level is set as it saves, from where it's added; it saves its condition or its chaining operator, by its type. */
export const EMPTY_REQUIREMENT: RequirementFormData = {
  level: "",
  target: "",
  operator: "",
  value: "",
  chainingOperator: "",
};
