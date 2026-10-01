import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type SaveFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["saves"]["$post"]>["json"];

type Ability = RulesetAbility;

interface SaveFormFieldsProps {
  form: UseFormReturn<SaveFormData>;
  abilities: Ability[];
}

export function SaveFormFields({ form, abilities }: SaveFormFieldsProps) {
  return (
    <>
      <NameField {...form.register("name", nameRules)} error={form.formState.errors.name} />
      <DescriptionField {...form.register("description")} />
      <SelectField
        control={form.control}
        name="abilityId"
        label="Linked Ability"
        rules={{ required: "Ability is required" }}
        options={abilities.map((ability) => ({ value: ability.id, label: ability.name }))}
      />
    </>
  );
}
