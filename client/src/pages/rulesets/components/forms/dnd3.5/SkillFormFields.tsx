import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import type { Ability } from "@/client/src/hooks/index.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import { EntityFields } from "@/client/src/pages/rulesets/components/forms/EntityFields.tsx";
import type { rpc } from "@/client/src/services/rpc.ts";

interface SkillFormFieldsProps {
  abilities: Ability[];
  /** Why the abilities didn't load. */
  abilitiesError: unknown;
  form: UseFormReturn<SkillFormData>;
  rulesetId: string;
}

export type SkillFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"];

/** A skill's name, description and primary ability, then the fields its ruleset declares for skills. */
export function SkillFormFields({ form, abilities, abilitiesError, rulesetId }: SkillFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <SelectField
        control={form.control}
        name="primaryAbilityId"
        label="Primary Ability"
        rules={requiredRules("Primary ability is required")}
        options={abilities.map((ability) => ({ value: ability.id, label: ability.name }))}
        loadError={abilitiesError}
      />
      <EntityFields form={form} entityType="skills" rulesetId={rulesetId} />
    </>
  );
}
