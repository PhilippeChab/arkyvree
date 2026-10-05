import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { type UseFormReturn } from "react-hook-form";

import { SelectField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { ConditionFields } from "./ConditionFields.tsx";

export type RequirementFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"]["$post"]
>["json"];

/** A condition checks a path; a chaining node joins its children with AND / OR. */
export type RequirementType = "condition" | "chaining";

interface RequirementFormProps {
  form: UseFormReturn<RequirementFormData>;
  type: RequirementType;
  onTypeChange: (type: RequirementType) => void;
  rulesetId: string;
  mode: "create" | "edit";
}

const CHAINING_OPERATORS = [
  { value: "and", label: "AND" },
  { value: "or", label: "OR" },
];

/** A requirement's type, then its condition (target, operator, value) or its chaining operator. */
export function RequirementForm({ form, type, onTypeChange, rulesetId, mode }: RequirementFormProps) {
  const { errors } = form.formState;

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
        <ConditionFields
          kind="requirement"
          rulesetId={rulesetId}
          mode={mode}
          values={{
            target: form.watch("target") || "",
            operator: form.watch("operator") || "",
            value: form.watch("value") || "",
          }}
          errors={errors}
          onChange={(field, value) => {
            form.setValue(field, value);
            form.clearErrors(field);
          }}
        />
      )}
    </>
  );
}
