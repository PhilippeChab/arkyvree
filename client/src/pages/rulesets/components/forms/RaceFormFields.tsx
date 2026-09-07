import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";

export type RaceFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["races"]["$post"]
>["json"];

interface RaceFormFieldsProps {
  form: UseFormReturn<RaceFormData>;
}

export function RaceFormFields({ form }: RaceFormFieldsProps) {
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
      <FormControl fullWidth>
        <InputLabel>Size</InputLabel>
        <Select
          {...form.register("size")}
          label="Size"
          value={form.watch("size") || "Medium"}
        >
          {SIZE_OPTIONS.map((size) => (
            <MenuItem key={size} value={size}>{size}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        {...form.register("baseSpeed", { valueAsNumber: true })}
        label="Base Speed (feet)"
        type="number"
        fullWidth
      />
    </>
  );
}
