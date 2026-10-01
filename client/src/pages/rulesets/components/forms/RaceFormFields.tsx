import { TextField } from "@mui/material";
import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

export type RaceFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["races"]["$post"]>["json"];

interface RaceFormFieldsProps {
  form: UseFormReturn<RaceFormData>;
}

export function RaceFormFields({ form }: RaceFormFieldsProps) {
  return (
    <>
      <NameField {...form.register("name", nameRules)} error={form.formState.errors.name} />
      <DescriptionField {...form.register("description")} />
      <SelectField control={form.control} name="size" label="Size" options={SIZE_OPTIONS} />
      <TextField
        {...form.register("baseSpeed", { valueAsNumber: true })}
        label="Base Speed (feet)"
        type="number"
        fullWidth
      />
    </>
  );
}
