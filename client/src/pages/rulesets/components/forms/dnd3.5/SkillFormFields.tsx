import { FormControlLabel, Switch, TextField } from "@mui/material";
import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import { nameRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type Ability = RulesetAbility;

interface SkillFormFieldsProps {
  form: UseFormReturn<SkillFormData>;
  abilities: Ability[];
}

export type SkillFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"];

export function SkillFormFields({ form, abilities }: SkillFormFieldsProps) {
  const impactedByWeight = !!form.watch("impactedByWeight");
  const { errors } = form.formState;

  return (
    <>
      <NameField {...form.register("name", nameRules)} error={form.formState.errors.name} />
      <DescriptionField {...form.register("description")} />
      <SelectField
        control={form.control}
        name="primaryAbilityId"
        label="Primary Ability"
        rules={{ required: "Primary ability is required" }}
        options={abilities.map((ability) => ({ value: ability.id, label: ability.name }))}
      />
      <FormControlLabel
        label="Impacted by Weight"
        control={
          <Switch
            {...form.register("impactedByWeight", {
              // The multiplier field hides with the weight, and a hidden field isn't validated: drop its value.
              onChange: (event) => {
                if (!event.target.checked) form.setValue("checkPenaltyMultiplier", 1);
              },
            })}
            checked={impactedByWeight}
          />
        }
      />
      {impactedByWeight && (
        <TextField
          {...form.register("checkPenaltyMultiplier", wholeNumberRules(1, "Multiplier is required"))}
          label="Armor Check Penalty Multiplier"
          type="number"
          fullWidth
          error={!!errors.checkPenaltyMultiplier}
          helperText={
            errors.checkPenaltyMultiplier?.message ?? "How many times over the skill takes the penalty: 2 for Swim"
          }
        />
      )}
      <FormControlLabel
        label="Usable Without Training"
        control={<Switch {...form.register("usableWithoutTraining")} checked={!!form.watch("usableWithoutTraining")} />}
      />
    </>
  );
}
