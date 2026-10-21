import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { EntityFormFields } from "./EntityFormFields.tsx";

interface SkillFormFieldsProps {
  form: UseFormReturn<SkillFormData>;
  rulesetId: string;
}

export type SkillFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["skills"]["$post"]>["json"];

/** A skill's name and description, then its columns and fields as its rules describe them (3.5's primary ability). */
export function SkillFormFields({ form, rulesetId }: SkillFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <EntityFormFields form={form} entityType="skills" rulesetId={rulesetId} />
    </>
  );
}
