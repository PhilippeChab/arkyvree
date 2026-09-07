import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";

export type SaveFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["saves"]["$post"]
>["json"];

type AbilitiesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"]>;
type AbilitiesPaginated = Exclude<AbilitiesResponse, { error: string }>;
type Ability = AbilitiesPaginated["items"][number];

interface SaveFormFieldsProps {
  form: UseFormReturn<SaveFormData>;
  abilities: Ability[];
}

export function SaveFormFields({ form, abilities }: SaveFormFieldsProps) {
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
        <InputLabel>Linked Ability</InputLabel>
        <Select
          {...form.register("abilityId", { required: "Ability is required" })}
          label="Linked Ability"
          value={(() => { const v = form.watch("abilityId"); return v && abilities.some((a) => a.id === v) ? v : ""; })()}
        >
          {abilities.map((ability) => (
            <MenuItem key={ability.id} value={ability.id}>{ability.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </>
  );
}
