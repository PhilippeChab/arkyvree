import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField } from "@/client/src/components/common/index.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface LanguageFormFieldsProps {
  form: UseFormReturn<LanguageFormData>;
}

export type LanguageFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["languages"]["$post"]>["json"];

export function LanguageFormFields({ form }: LanguageFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={NAME_RULES} />
      <DescriptionField control={form.control} name="description" />
      <FormTextField
        control={form.control}
        name="type"
        label="Type"
        fullWidth
        placeholder="e.g., Spoken, Written, Sign"
      />
    </>
  );
}
