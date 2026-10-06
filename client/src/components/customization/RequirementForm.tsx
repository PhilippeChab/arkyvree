import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useController, type UseFormReturn } from "react-hook-form";

import { SelectField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { ConditionFields } from "./ConditionFields.tsx";

interface RequirementFormProps {
  form: UseFormReturn<RequirementFormData>;
  type: RequirementType;
  onTypeChange: (type: RequirementType) => void;
  rulesetId: string;
  mode: "create" | "edit";
}

type RequirementConditionFieldsProps = Pick<RequirementFormProps, "form" | "rulesetId" | "mode">;

export type RequirementFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"]["$post"]
>["json"];

/** A condition checks a path; a chaining node joins its children with AND / OR. */
export type RequirementType = "condition" | "chaining";

const CHAINING_OPERATORS = [
  { value: "and", label: "AND" },
  { value: "or", label: "OR" },
];

/** A condition's fields, bound while the requirement is a condition (a chaining node drops them). */
function RequirementConditionFields({ form, rulesetId, mode }: RequirementConditionFieldsProps) {
  const target = useController({ control: form.control, name: "target" });
  const operator = useController({ control: form.control, name: "operator" });
  const value = useController({ control: form.control, name: "value" });
  return <ConditionFields kind="requirement" rulesetId={rulesetId} mode={mode} fields={{ target, operator, value }} />;
}

/** A requirement's type, then its condition (target, operator, value) or its chaining operator. */
export function RequirementForm({ form, type, onTypeChange, rulesetId, mode }: RequirementFormProps) {
  return (
    <>
      <Box>
        <Typography variant="subtitle2" gutterBottom sx={{ color: "text.secondary" }}>
          Type
        </Typography>
        <ToggleButtonGroup
          value={type}
          exclusive
          size="small"
          onChange={(_, next: RequirementType | null) => {
            if (!next) return;
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
        >
          <ToggleButton value="condition">
            <Typography variant="body2">Condition</Typography>
          </ToggleButton>
          <ToggleButton value="chaining">
            <Typography variant="body2">Chaining</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {type === "chaining" ? (
        <SelectField
          control={form.control}
          name="chainingOperator"
          label="Chaining Operator"
          rules={{ required: "Chaining operator is required" }}
          options={CHAINING_OPERATORS}
        />
      ) : (
        <RequirementConditionFields form={form} rulesetId={rulesetId} mode={mode} />
      )}
    </>
  );
}
