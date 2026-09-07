import {
  AptitudesAutocomplete,
  type Aptitude,
} from "@/client/src/components/customization/index.ts";
import { TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";

export type FeatFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["feats"]["$post"]
>["json"];

interface FeatFormFieldsProps {
  form: UseFormReturn<FeatFormData>;
  rulesetId: string;
  selectedAptitudes: Aptitude[];
  onAptitudesChange: (aptitudes: Aptitude[]) => void;
}

export function FeatFormFields({ form, rulesetId, selectedAptitudes, onAptitudesChange }: FeatFormFieldsProps) {
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
      <AptitudesAutocomplete
        rulesetId={rulesetId}
        value={selectedAptitudes}
        onChange={onAptitudesChange}
      />
    </>
  );
}
