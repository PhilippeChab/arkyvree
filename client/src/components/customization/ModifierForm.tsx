import { useController, type UseFormReturn } from "react-hook-form";

import { ConditionFields } from "./ConditionFields.tsx";

interface ModifierFormProps {
  form: UseFormReturn<ModifierFormData>;
  rulesetId: string;
  /** Filters target-path completions to those allowed for this entity type. */
  entityType?: string;
  mode: "create" | "edit";
}

export interface ModifierFormData {
  target: string;
  value: string;
  operator: string;
}

export function ModifierForm({ form, rulesetId, entityType, mode }: ModifierFormProps) {
  const target = useController({ control: form.control, name: "target" });
  const operator = useController({ control: form.control, name: "operator" });
  const value = useController({ control: form.control, name: "value" });
  return (
    <ConditionFields
      kind="modifier"
      rulesetId={rulesetId}
      entityType={entityType}
      mode={mode}
      fields={{ target, operator, value }}
    />
  );
}
