import { nameRules } from "@/client/src/lib/validation.ts";
import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";

export type LanguageFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["languages"]["$post"]
>["json"];

export function LanguageFormFields({ form }: { form: UseFormReturn<LanguageFormData> }) {
  return (
    <>
      <NameField
        {...form.register("name", nameRules)}
        error={form.formState.errors.name}
      />
      <DescriptionField
        {...form.register("description")}
      />
      <TextField
        {...form.register("type")}
        label="Type"
        fullWidth
        placeholder="e.g., Spoken, Written, Sign"
      />
    </>
  );
}
