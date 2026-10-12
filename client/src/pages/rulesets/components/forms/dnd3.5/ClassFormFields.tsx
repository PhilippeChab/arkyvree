import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { formatDie } from "@/client/src/lib/formatNumeric.ts";
import { EntityFields } from "@/client/src/pages/rulesets/components/forms/EntityFields.tsx";
import type { ClassFormData } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { HIT_DIE_VALUES } from "@/vocabulary/dnd3.5/classes.ts";

interface ClassFormFieldsProps {
  form: UseFormReturn<ClassFormData>;
  rulesetId: string;
}

const HIT_DIE_OPTIONS = HIT_DIE_VALUES.map((value) => ({ value, label: formatDie(value) }));

/** A 3.5 class's name, description and hit die, then the fields its ruleset declares for classes. */
export function ClassFormFields({ form, rulesetId }: ClassFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <SelectField control={form.control} name="hd" label="Hit Die" options={HIT_DIE_OPTIONS} />
      <EntityFields form={form} entityType="klasses" rulesetId={rulesetId} help />
    </>
  );
}
