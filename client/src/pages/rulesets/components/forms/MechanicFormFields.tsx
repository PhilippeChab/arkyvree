import { TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";

export type MechanicFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["mechanics"]["$post"]
>["json"];

interface MechanicFormFieldsProps {
  form: UseFormReturn<MechanicFormData>;
}

export function MechanicFormFields({ form }: MechanicFormFieldsProps) {
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
        minRows={10}
        sx={{ "& .MuiInputBase-inputMultiline": { resize: "vertical" } }}
      />
    </>
  );
}
