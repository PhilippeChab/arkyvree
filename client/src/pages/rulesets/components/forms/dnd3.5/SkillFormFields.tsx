import { nameRules } from "@/client/src/lib/validation.ts";
import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import {
  Box,
  Switch,
  Typography,
} from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import type { InferRequestType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";

export type SkillFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["skills"]["$post"]
>["json"];

type Ability = RulesetAbility;

interface SkillFormFieldsProps {
  form: UseFormReturn<SkillFormData>;
  abilities: Ability[];
}

export function SkillFormFields({ form, abilities }: SkillFormFieldsProps) {
  return (
    <>
      <NameField
        {...form.register("name", nameRules)}
        error={form.formState.errors.name}
      />
      <DescriptionField
        {...form.register("description")}
      />
      <SelectField
        control={form.control}
        name="primaryAbilityId"
        label="Primary Ability"
        rules={{ required: "Primary ability is required" }}
        options={abilities.map((ability) => ({ value: ability.id, label: ability.name }))}
      />
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
