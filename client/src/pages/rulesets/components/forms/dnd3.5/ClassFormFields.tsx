import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { formatHitDie, HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";

interface ClassFormFieldsProps {
  form: UseFormReturn<ClassFormData>;
}

export type ClassFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["classes"]["$post"]>["json"];

const HIT_DIE_OPTIONS = HIT_DIE_VALUES.map((value) => ({ value, label: formatHitDie(value) }));

export function ClassFormFields({ form }: ClassFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <SelectField control={form.control} name="hd" label="Hit Die" options={HIT_DIE_OPTIONS} />
    </>
  );
}
