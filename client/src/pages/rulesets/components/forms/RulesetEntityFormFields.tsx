import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";

import { EntityFields } from "./EntityFields.tsx";
import type { EntityFormData } from "./entityForm.ts";
import type { FieldContext } from "./fieldContext.ts";

interface RulesetEntityFormFieldsProps {
  /** Its fields among its others two side by side past a phone's width (`EntityFields`'s) */
  columns?: 1 | 2;
  context?: FieldContext;
  entityType: string;
  form: UseFormReturn<EntityFormData>;
  /** Its fields among its others each say what they're for under them */
  help?: boolean;
  /** Its description runs long, so its input gives it room (a mechanic's, which holds a rule's whole text) */
  longDescription?: boolean;
  /** Why its name can't change, when it can't (a generated feat's names its option: `Weapon Focus: Longsword`) */
  nameLocked?: string;
  rulesetId: string;
}

/** The rows a long description's input takes. */
const LONG_DESCRIPTION_ROWS = 10;

/**
 * A ruleset entity's form, any kind's: its name and its description, then its fields as its rules describe them
 * (`EntityFields`: a skill's ability, a language's type, a feat's pools, a spell's save and spell lists).
 */
export function RulesetEntityFormFields({
  form,
  longDescription,
  nameLocked,
  ...fields
}: RulesetEntityFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" disabled={!!nameLocked} helperText={nameLocked} />
      <DescriptionField
        control={form.control}
        name="description"
        rows={longDescription ? LONG_DESCRIPTION_ROWS : undefined}
      />
      <EntityFields form={form} {...fields} />
    </>
  );
}
