import {} from "@mui/material";
import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type LanguageFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["languages"]["$post"]>["json"];

export function LanguageFormFields({ form }: { form: UseFormReturn<LanguageFormData> }) {
  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
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
