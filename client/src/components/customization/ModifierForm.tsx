import type { UseFormReturn } from "react-hook-form";

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
  return (
    <ConditionFields
      kind="modifier"
      rulesetId={rulesetId}
      entityType={entityType}
      mode={mode}
      values={{
        target: form.watch("target") || "",
        operator: form.watch("operator") || "",
        value: form.watch("value") || "",
      }}
      errors={form.formState.errors}
      onChange={(field, value) => {
        form.setValue(field, value);
        form.clearErrors(field);
      }}
    />
  );
}
