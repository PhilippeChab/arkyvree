import { useQuery } from "@tanstack/react-query";
import { type UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { DECIMAL_RULES } from "@/client/src/lib/validation.ts";
import { itemTemplatesQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { TEMPLATE_ITEM_TYPES, type TemplateItemType } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { ITEM_TYPE_OPTIONS, type ItemFormData } from "./itemForm.ts";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormData>;
  /** Keeps the type, slot and template as they are (a duplicate copies them from its source). */
  lockType?: boolean;
  rulesetId: string;
}

interface TemplateSelectorProps {
  disabled?: boolean;
  form: UseFormReturn<ItemFormData>;
  rulesetId: string;
  type: TemplateItemType;
}

function TemplateSelector({ form, rulesetId, type, disabled }: TemplateSelectorProps) {
  const { data: templates, isLoading, error } = useQuery(itemTemplatesQuery(rulesetId, type));

  // Empty until the templates load (a value with no option is out of range); one this ruleset no longer has shows as "None".
  return (
    <SelectField
      control={form.control}
      name="sourceItemId"
      label={`${type} Template`}
      options={templates?.map((t) => ({ value: t.id, label: t.name })) ?? []}
      emptyLabel="None"
      disabled={isLoading || disabled}
      loadError={error}
    />
  );
}

export function ItemFormFields({ form, rulesetId, lockType }: ItemFormFieldsProps) {
  const itemType = form.watch("type");
  const isTemplate = form.watch("isTemplate");

  // A template type has no slot, and starts with no template
  const handleTypeChange = (newType: unknown) => {
    if (!isOneOf(newType, TEMPLATE_ITEM_TYPES)) return;
    form.setValue("slot", "", { shouldDirty: true });
    form.setValue("sourceItemId", "", { shouldDirty: true });
  };

  return (
    <>
      <NameField control={form.control} name="name" />
      <DescriptionField control={form.control} name="description" />
      <FormTextField
        control={form.control}
        name="costGp"
        rules={DECIMAL_RULES}
        label="Cost (gp)"
        type="text"
        fullWidth
        slotProps={{
          htmlInput: { inputMode: "decimal" },
        }}
      />
      <FormTextField
        control={form.control}
        name="weight"
        rules={DECIMAL_RULES}
        label="Weight (lbs)"
        type="text"
        fullWidth
        slotProps={{
          htmlInput: { inputMode: "decimal" },
        }}
      />
      <SelectField
        control={form.control}
        name="type"
        label="Item Type"
        options={ITEM_TYPE_OPTIONS}
        emptyLabel="None"
        onChange={handleTypeChange}
        disabled={lockType}
      />
      {isOneOf(itemType, TEMPLATE_ITEM_TYPES) ? (
        !isTemplate && <TemplateSelector form={form} rulesetId={rulesetId} type={itemType} disabled={lockType} />
      ) : (
        <SelectField
          control={form.control}
          name="slot"
          label="Slot"
          options={LOCATION_OPTIONS}
          emptyLabel="None"
          disabled={lockType}
        />
      )}
    </>
  );
}
