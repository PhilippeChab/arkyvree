import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";

export type SkillFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["skills"]["$post"]
>["json"];

type AbilitiesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"]>;
type AbilitiesPaginated = Exclude<AbilitiesResponse, { error: string }>;
type Ability = AbilitiesPaginated["items"][number];

interface SkillFormFieldsProps {
  form: UseFormReturn<SkillFormData>;
  abilities: Ability[];
}

export function SkillFormFields({ form, abilities }: SkillFormFieldsProps) {
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
        <InputLabel>Primary Ability</InputLabel>
        <Select
          {...form.register("primaryAbilityId", {
            required: "Primary ability is required",
          })}
          label="Primary Ability"
          value={(() => { const v = form.watch("primaryAbilityId"); return v && abilities.some((a) => a.id === v) ? v : ""; })()}
        >
          {abilities.map((ability) => (
            <MenuItem key={ability.id} value={ability.id}>{ability.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box>
        <Typography variant="body2" gutterBottom>Impacted by Weight</Typography>
        <Switch
          {...form.register("impactedByWeight")}
          checked={!!form.watch("impactedByWeight")}
        />
      </Box>
      <Box>
        <Typography variant="body2" gutterBottom>Usable Without Training</Typography>
        <Switch
          {...form.register("usableWithoutTraining")}
          checked={!!form.watch("usableWithoutTraining")}
        />
      </Box>
    </>
  );
}
