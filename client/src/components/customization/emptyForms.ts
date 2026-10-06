/** A modifier's and a requirement's form, empty: what a create dialog opens on, and an edit dialog's until it's reset. */

import type { ModifierFormData } from "./ModifierForm.tsx";
import type { RequirementFormData } from "./RequirementForm.tsx";

export const EMPTY_MODIFIER: ModifierFormData = { target: "", operator: "", value: "" };

/** Its level is set as it saves, from where it's added. */
export const EMPTY_REQUIREMENT: RequirementFormData = { level: "", target: "", operator: "", value: "" };
