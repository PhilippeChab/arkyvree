import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import {
  DescriptionField,
  FormTextField,
  NameField,
  SelectField,
  SwitchField,
} from "@/client/src/components/common/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import { NAME_RULES, requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type Ability = RulesetAbility;

interface SkillFormFieldsProps {
  form: UseFormReturn<SkillFormData>;
  abilities: Ability[];
  /** Why the abilities didn't load. */
  abilitiesError: unknown;
}

export type SkillFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"];

export function SkillFormFields({ form, abilities, abilitiesError }: SkillFormFieldsProps) {
  const impactedByWeight = !!form.watch("impactedByWeight");

  return (
    <>
      <NameField control={form.control} name="name" rules={NAME_RULES} />
      <DescriptionField control={form.control} name="description" />
      <SelectField
        control={form.control}
        name="primaryAbilityId"
        label="Primary Ability"
        rules={requiredRules("Primary ability is required")}
        options={abilities.map((ability) => ({ value: ability.id, label: ability.name }))}
        loadError={abilitiesError}
      />
      <SwitchField
        control={form.control}
        name="impactedByWeight"
        label="Impacted by Weight"
        // The multiplier field hides with the weight, and a hidden field isn't validated: drop its value.
        onChange={(checked) => {
          if (!checked) form.setValue("checkPenaltyMultiplier", 1);
        }}
      />
      {impactedByWeight && (
        <FormTextField
          control={form.control}
          name="checkPenaltyMultiplier"
          rules={wholeNumberRules(1, "Multiplier is required")}
          number
          label="Armor Check Penalty Multiplier"
          fullWidth
        />
      )}
      <SwitchField control={form.control} name="usableWithoutTraining" label="Usable Without Training" />
    </>
  );
}
