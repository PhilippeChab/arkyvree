import { MenuItem, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { type ChangeEvent } from "react";
import { useController, type UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField } from "@/client/src/components/common/index.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import { ITEM_TYPE_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

import { DECIMAL_PATTERN, isTemplateType, type ItemFormInternal, type TemplateType } from "./itemForm.ts";
import { itemTemplatesQuery } from "./itemFormQueries.ts";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormInternal>;
  rulesetId: string;
  /** Keeps the type, slot and template as they are (a duplicate copies them from its source). */
  lockType?: boolean;
}

interface TemplateSelectorProps {
  form: UseFormReturn<ItemFormInternal>;
  rulesetId: string;
  type: TemplateType;
  disabled?: boolean;
}

/** A cost or a weight: a decimal number, or empty. */
const DECIMAL_RULES = { pattern: DECIMAL_PATTERN };

function TemplateSelector({ form, rulesetId, type, disabled }: TemplateSelectorProps) {
  const { data: templates, isLoading } = useQuery(itemTemplatesQuery(rulesetId, type));

  const { field } = useController({ control: form.control, name: "sourceItemId" });
  const rawValue = field.value || "";
  // Empty until the templates load (a value with no option is out of range); one this ruleset no longer has shows as "None".
  const value = templates?.some((t) => t.id === rawValue) ? rawValue : "";

  return (
    <TextField
      name={field.name}
      label={`${type} Template`}
      fullWidth
      select
      value={value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      inputRef={field.ref}
      disabled={isLoading || disabled}
    >
      <MenuItem value="">None</MenuItem>
      {templates?.map((t) => (
        <MenuItem key={t.id} value={t.id}>
          {t.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function ItemFormFields({ form, rulesetId, lockType }: ItemFormFieldsProps) {
  const { field: typeField } = useController({ control: form.control, name: "type" });
  const itemType = typeField.value;
  const isTemplate = form.watch("isTemplate");

  const handleTypeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value;
    typeField.onChange(newType);
    if (isTemplateType(newType)) {
      form.setValue("slot", "", { shouldDirty: true });
      form.setValue("sourceItemId", "", { shouldDirty: true });
    }
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
      <TextField
        name={typeField.name}
        label="Item Type"
        fullWidth
        select
        value={itemType || ""}
        onChange={handleTypeChange}
        onBlur={typeField.onBlur}
        inputRef={typeField.ref}
        disabled={lockType}
      >
        <MenuItem value="">None</MenuItem>
        {ITEM_TYPE_OPTIONS.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {opt}
          </MenuItem>
        ))}
      </TextField>
      {isTemplateType(itemType) ? (
        !isTemplate && <TemplateSelector form={form} rulesetId={rulesetId} type={itemType} disabled={lockType} />
      ) : (
        <FormTextField control={form.control} name="slot" label="Slot" fullWidth select disabled={lockType}>
          <MenuItem value="">None</MenuItem>
          {LOCATION_OPTIONS.map((slot) => (
            <MenuItem key={slot} value={slot}>
              {slot}
            </MenuItem>
          ))}
        </FormTextField>
      )}
    </>
  );
}
