import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import { NAME_RULES, requiredRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type Ability = RulesetAbility;

interface SaveFormFieldsProps {
  abilities: Ability[];
  /** Why the abilities didn't load. */
  abilitiesError: unknown;
  form: UseFormReturn<SaveFormData>;
}

export type SaveFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["saves"]["$post"]>["json"];

export function SaveFormFields({ form, abilities, abilitiesError }: SaveFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={NAME_RULES} />
      <DescriptionField control={form.control} name="description" />
      <SelectField
        control={form.control}
        name="abilityId"
        label="Linked Ability"
        rules={requiredRules("Ability is required")}
        options={abilities.map((ability) => ({ value: ability.id, label: ability.name }))}
        loadError={abilitiesError}
      />
    </>
  );
}
