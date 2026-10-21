import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import type { ClassFormData } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { EntityFormFields } from "./EntityFormFields.tsx";

interface ClassFormFieldsProps {
  form: UseFormReturn<ClassFormData>;
  rulesetId: string;
}

/** A class's name and description, then its columns and fields as its rules describe them (3.5's hit die). */
export function ClassFormFields({ form, rulesetId }: ClassFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <EntityFormFields form={form} entityType="klasses" rulesetId={rulesetId} help />
    </>
  );
}
