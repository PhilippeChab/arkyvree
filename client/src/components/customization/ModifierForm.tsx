import type { InferRequestType } from "hono/client";
import { useController, type UseFormReturn } from "react-hook-form";

import type { rpc } from "@/client/src/services/rpc.ts";

import { ConditionFields } from "./ConditionFields.tsx";
import { CONDITION_OPERATOR_RULES, CONDITION_TARGET_RULES, MODIFIER_VALUE_RULES } from "./conditionRules.ts";

interface ModifierFormProps {
  /** Filters target-path completions to those allowed for this entity type. */
  entityType?: string;
  form: UseFormReturn<ModifierFormData>;
  mode: "create" | "edit";
  rulesetId: string;
}

/** A modifier's fields, a ruleset entity's and a character's alike. */
export type ModifierFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$post"]
>["json"];

export function ModifierForm({ form, rulesetId, entityType, mode }: ModifierFormProps) {
  const target = useController({ control: form.control, name: "target", rules: CONDITION_TARGET_RULES });
  const operator = useController({ control: form.control, name: "operator", rules: CONDITION_OPERATOR_RULES });
  const value = useController({ control: form.control, name: "value", rules: MODIFIER_VALUE_RULES });
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
