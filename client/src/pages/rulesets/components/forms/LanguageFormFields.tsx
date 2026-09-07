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
      <TextField
        {...form.register("name", { required: "Name is required" })}
        label="Name"
        fullWidth
        error={!!form.formState.errors.name}
        helperText={form.formState.errors.name?.message}
      />
      <TextField
        {...form.register("description")}
        label="Description"
        fullWidth
        multiline
        minRows={3}
        sx={{ "& textarea": { resize: "vertical" } }}
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
