import { MenuItem, TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";

export type ClassFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"]["$post"]
>["json"];

export function ClassFormFields({ form }: { form: UseFormReturn<ClassFormData> }) {
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
        {...form.register("hd", { valueAsNumber: true })}
        label="Hit Die"
        select
        fullWidth
        value={form.watch("hd") ?? 8}
        error={!!form.formState.errors.hd}
        helperText={form.formState.errors.hd?.message}
      >
        {HIT_DIE_VALUES.map((v) => (
          <MenuItem key={v} value={v}>{`d${v}`}</MenuItem>
        ))}
      </TextField>
    </>
  );
}
