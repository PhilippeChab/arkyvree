import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

interface RaceFormFieldsProps {
  form: UseFormReturn<RaceFormData>;
}

export type RaceFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["races"]["$post"]>["json"];

export function RaceFormFields({ form }: RaceFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
      <DescriptionField control={form.control} name="description" />
      <SelectField control={form.control} name="size" label="Size" options={SIZE_OPTIONS} />
      <FormTextField control={form.control} name="baseSpeed" number label="Base Speed (feet)" type="number" fullWidth />
    </>
  );
}
