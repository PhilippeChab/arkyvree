import { useQuery } from "@tanstack/react-query";
import { type UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { DECIMAL_RULES } from "@/client/src/lib/validation.ts";
import { itemTemplatesQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { TEMPLATE_ITEM_TYPES, type TemplateItemType } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { fieldsClearedByType, ITEM_TYPE_OPTIONS, type ItemFormData, templateOptions } from "./itemForm.ts";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormData>;
  /** Keeps the type, slot and template as they are (a duplicate copies them from its source). */
  lockType?: boolean;
  rulesetId: string;
  /** The name of the template the item was saved with, which its select shows while it isn't one of the item's type. */
  templateName?: string | null;
}

interface TemplateSelectorProps {
  disabled?: boolean;
  form: UseFormReturn<ItemFormData>;
  rulesetId: string;
  templateName?: string | null;
  type: TemplateItemType;
}

function TemplateSelector({ form, rulesetId, templateName, type, disabled }: TemplateSelectorProps) {
  const { data: templates, isLoading, error } = useQuery(itemTemplatesQuery(rulesetId, type));
  const held = form.watch("sourceItemId");

  return (
    <SelectField
      control={form.control}
      name="sourceItemId"
      label={`${type} Template`}
      options={templateOptions(templates, held, templateName)}
      emptyLabel="None"
      disabled={isLoading || disabled}
      loadError={error}
    />
  );
}

export function ItemFormFields({ form, rulesetId, lockType, templateName }: ItemFormFieldsProps) {
  const itemType = form.watch("type");
  const isTemplate = form.watch("isTemplate");

  // A new type takes none of the old type's templates, and a template type sets its slot
  const handleTypeChange = (newType: unknown) => {
    for (const field of fieldsClearedByType(newType)) form.setValue(field, "", { shouldDirty: true });
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
      {/* A template is of a type an item can be based on a template of */}
      <SelectField
        control={form.control}
        name="type"
        label="Item Type"
        options={isTemplate ? TEMPLATE_ITEM_TYPES : ITEM_TYPE_OPTIONS}
        emptyLabel={isTemplate ? undefined : "None"}
        onChange={handleTypeChange}
        disabled={lockType}
      />
      {isOneOf(itemType, TEMPLATE_ITEM_TYPES) ? (
        !isTemplate && (
          <TemplateSelector
            form={form}
            rulesetId={rulesetId}
            templateName={templateName}
            type={itemType}
            disabled={lockType}
          />
        )
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
