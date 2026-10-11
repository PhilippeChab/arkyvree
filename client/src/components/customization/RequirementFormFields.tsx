import type { InferRequestType } from "hono/client";
import { useController, type UseFormReturn } from "react-hook-form";

import { OptionToggle, SelectField } from "@/client/src/components/common/index.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { CHAINING_OPERATORS, formatChainingOperator } from "@/shared/customization/operators.ts";

import { ConditionFields, type ConditionMode } from "./ConditionFields.tsx";
import { CONDITION_OPERATOR_RULES, CONDITION_TARGET_RULES, REQUIREMENT_VALUE_RULES } from "./conditionRules.ts";

interface RequirementFormFieldsProps {
  form: UseFormReturn<RequirementFormData>;
  mode: ConditionMode;
  onTypeChange: (type: RequirementType) => void;
  rulesetId: string;
  type: RequirementType;
}

type RequirementConditionFieldsProps = Pick<RequirementFormFieldsProps, "form" | "rulesetId" | "mode">;

export type RequirementFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"]["$post"]
>["json"];

/** A condition checks a path; a chaining node joins its children with AND / OR. */
export type RequirementType = "condition" | "chaining";

/** The chaining operators, in their words */
const CHAINING_OPTIONS = CHAINING_OPERATORS.map((operator) => ({
  value: operator,
  label: formatChainingOperator(operator),
}));

/** A requirement's types: a condition, or a chaining node */
const REQUIREMENT_TYPE_OPTIONS = [
  { value: "condition", label: "Condition" },
  { value: "chaining", label: "Chaining" },
] as const;

/** A condition's fields, bound while the requirement is a condition (a chaining node drops them). */
function RequirementConditionFields({ form, rulesetId, mode }: RequirementConditionFieldsProps) {
  const target = useController({ control: form.control, name: "target", rules: CONDITION_TARGET_RULES });
  const operator = useController({ control: form.control, name: "operator", rules: CONDITION_OPERATOR_RULES });
  const value = useController({ control: form.control, name: "value", rules: REQUIREMENT_VALUE_RULES });
  return <ConditionFields kind="requirement" rulesetId={rulesetId} mode={mode} fields={{ target, operator, value }} />;
}

/** A requirement's type, then its condition (target, operator, value) or its chaining operator. */
export function RequirementFormFields({ form, type, onTypeChange, rulesetId, mode }: RequirementFormFieldsProps) {
  return (
    <>
      <OptionToggle
        label="Type"
        options={REQUIREMENT_TYPE_OPTIONS}
        value={type}
        onChange={(next) => {
          onTypeChange(next);
          // Only the chosen type's fields (and their rules) take part in the submit.
          if (next === "chaining") {
            form.unregister("target");
            form.unregister("operator");
            form.unregister("value");
          } else {
            form.unregister("chainingOperator");
          }
        }}
      />

      {type === "chaining" ? (
        <SelectField
          control={form.control}
          name="chainingOperator"
          label="Chaining Operator"
          rules={requiredRules("Chaining operator is required")}
          options={CHAINING_OPTIONS}
        />
      ) : (
        <RequirementConditionFields form={form} rulesetId={rulesetId} mode={mode} />
      )}
    </>
  );
}
