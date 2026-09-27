import {
  AptitudesAutocomplete,
  type Aptitude,
} from "@/client/src/components/customization/index.ts";
import { TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";
import { byName, useAptitudeLookup } from "./aptitudeLookup.ts";

export type FeatFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["feats"]["$post"]
>["json"];

interface FeatFormFieldsProps {
  form: UseFormReturn<FeatFormData>;
  rulesetId: string;
  /** Aptitudes the form may already hold (the feat's own), so they show by name. */
  knownAptitudes?: Aptitude[];
}

/** Name, description and aptitudes of a feat; the aptitudes live in the form as `aptitudeIds`, sorted by name. */
export function FeatFormFields({ form, rulesetId, knownAptitudes = [] }: FeatFormFieldsProps) {
  const aptitudes = useAptitudeLookup(knownAptitudes);
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
        value={aptitudes.resolve(form.watch("aptitudeIds") ?? [])}
        onChange={(selected) => {
          aptitudes.remember(selected);
          form.setValue("aptitudeIds", [...selected].sort(byName).map((a) => a.id), { shouldDirty: true });
        }}
      />
    </>
  );
}
