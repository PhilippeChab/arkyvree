import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";

import type { ColumnContext } from "./columnContext.ts";
import { EntityFormFields } from "./EntityFormFields.tsx";
import type { ItemFormData } from "./itemForm.ts";

interface ItemFormFieldsProps {
  /**
   * Whether it's new (a create dialog's, which sends every field: a type change drops the template's values it holds),
   * the columns it keeps as they are (a duplicate's type, slot and template), and its saved template's name
   */
  context?: ColumnContext;
  form: UseFormReturn<ItemFormData>;
  rulesetId: string;
}

/**
 * An item's name and description, then its columns and fields as its rules describe them (3.5's cost, weight, type,
 * and slot or template, its fields two side by side).
 */
export function ItemFormFields({ context, form, rulesetId }: ItemFormFieldsProps) {
  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <EntityFormFields form={form} entityType="items" rulesetId={rulesetId} columns={2} context={context} />
    </>
  );
}
