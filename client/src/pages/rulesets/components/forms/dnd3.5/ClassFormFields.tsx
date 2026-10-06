import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";

interface ClassFormFieldsProps {
  form: UseFormReturn<ClassFormData>;
}

export type ClassFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["classes"]["$post"]>["json"];

/** A hit die's choices, labeled as the dice they roll */
const HIT_DIE_CHOICES = HIT_DIE_VALUES.map((v) => ({ value: v, label: `d${v}` }));

export function ClassFormFields({ form }: ClassFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
      <DescriptionField control={form.control} name="description" />
      <SelectField control={form.control} name="hd" label="Hit Die" options={HIT_DIE_CHOICES} />
    </>
  );
}
