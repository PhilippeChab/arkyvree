import { useQuery } from "@tanstack/react-query";
import { type UseFormReturn } from "react-hook-form";

import {
  DescriptionField,
  FormTextField,
  LoadError,
  NameField,
  SelectField,
} from "@/client/src/components/common/index.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import { ITEM_TYPE_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

import { DECIMAL_PATTERN, isTemplateType, type ItemFormInternal, type TemplateType } from "./itemForm.ts";
import { itemTemplatesQuery } from "./itemFormQueries.ts";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormInternal>;
  /** Keeps the type, slot and template as they are (a duplicate copies them from its source). */
  lockType?: boolean;
  rulesetId: string;
}

interface TemplateSelectorProps {
  disabled?: boolean;
  form: UseFormReturn<ItemFormInternal>;
  rulesetId: string;
  type: TemplateType;
}

/** A cost or a weight: a decimal number, or empty. */
const DECIMAL_RULES = { pattern: DECIMAL_PATTERN };

function TemplateSelector({ form, rulesetId, type, disabled }: TemplateSelectorProps) {
  const { data: templates, isLoading, error } = useQuery(itemTemplatesQuery(rulesetId, type));

  // Empty until the templates load (a value with no option is out of range); one this ruleset no longer has shows as "None".
  return (
    <>
      <SelectField
        control={form.control}
        name="sourceItemId"
        label={`${type} Template`}
        options={templates?.map((t) => ({ value: t.id, label: t.name })) ?? []}
        emptyLabel="None"
        emptyValue=""
        disabled={isLoading || disabled}
      />
      {!!error && <LoadError what="Templates" error={error} />}
    </>
  );
}

export function ItemFormFields({ form, rulesetId, lockType }: ItemFormFieldsProps) {
  const itemType = form.watch("type");
  const isTemplate = form.watch("isTemplate");

  // A template type has no slot, and starts with no template
  const handleTypeChange = (newType: unknown) => {
    if (!isTemplateType(newType)) return;
    form.setValue("slot", "", { shouldDirty: true });
    form.setValue("sourceItemId", "", { shouldDirty: true });
  };

  return (
    <>
      <NameField control={form.control} name="name" rules={NAME_RULES} />
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
        emptyValue=""
        onChange={handleTypeChange}
        disabled={lockType}
      />
      {isTemplateType(itemType) ? (
        !isTemplate && <TemplateSelector form={form} rulesetId={rulesetId} type={itemType} disabled={lockType} />
      ) : (
        <SelectField
          control={form.control}
          name="slot"
          label="Slot"
          options={LOCATION_OPTIONS}
          emptyLabel="None"
          emptyValue=""
          disabled={lockType}
        />
      )}
    </>
  );
}
