import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";

import type { ColumnContext } from "./columnContext.ts";
import type { EntityFormData } from "./entityForm.ts";
import { EntityFormFields } from "./EntityFormFields.tsx";

interface RulesetEntityFormFieldsProps {
  /** Its declared fields two side by side past a phone's width (`EntityFields`'s) */
  columns?: 1 | 2;
  context?: ColumnContext;
  /** Its description's rows, past the usual (a mechanic's, which holds a rule's whole text) */
  descriptionRows?: number;
  entityType: string;
  form: UseFormReturn<EntityFormData>;
  /** Its declared fields each say what they're for under them */
  help?: boolean;
  /** Why its name can't change, when it can't (a generated feat's names its option: `Weapon Focus: Longsword`) */
  nameLocked?: string;
  rulesetId: string;
}

/**
 * A ruleset entity's form, any kind's: its name and its description, then its columns and fields as its rules describe
 * them (`EntityFormFields`: a skill's ability, a language's type, a feat's pools, a spell's save and spell lists).
 */
export function RulesetEntityFormFields({
  descriptionRows,
  form,
  nameLocked,
  ...fields
}: RulesetEntityFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" disabled={!!nameLocked} helperText={nameLocked} />
      <DescriptionField control={form.control} name="description" rows={descriptionRows} />
      <EntityFormFields form={form} {...fields} />
    </>
  );
}
