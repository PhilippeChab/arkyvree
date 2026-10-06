import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, FormTextField, NameField, SelectField } from "@/client/src/components/common/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { ITEM_TYPE_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { LOCATION_OPTIONS } from "@/shared/enums.ts";

import { DECIMAL_PATTERN, isTemplateType, type ItemFormInternal, type TemplateType } from "./itemForm.ts";

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

function TemplateSelector({ form, rulesetId, type, disabled }: TemplateSelectorProps) {
  const { data: templates, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, `templates-${type}`),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].templates.$get({ param: { id: rulesetId }, query: { type } })),
  });

  // A template this ruleset no longer has shows as "None"
  return (
    <SelectField
      control={form.control}
      name="sourceItemId"
      label={`${type} Template`}
      none=""
      options={(templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
      disabled={isLoading || disabled}
    />
  );
}

export function ItemFormFields({ form, rulesetId, lockType }: ItemFormFieldsProps) {
  const itemType = form.watch("type");
  const isTemplate = form.watch("isTemplate");

  const handleTypeChange = (newType: string | null) => {
    if (isTemplateType(newType)) {
      form.setValue("slot", "", { shouldDirty: true });
      form.setValue("sourceItemId", "", { shouldDirty: true });
    }
  };

  return (
    <>
      <NameField control={form.control} name="name" rules={nameRules} />
      <DescriptionField control={form.control} name="description" />
      <FormTextField
        control={form.control}
        name="costGp"
        rules={{ pattern: DECIMAL_PATTERN }}
        label="Cost (gp)"
        type="text"
        slotProps={{
          htmlInput: { inputMode: "decimal" },
        }}
      />
      <FormTextField
        control={form.control}
        name="weight"
        rules={{ pattern: DECIMAL_PATTERN }}
        label="Weight (lbs)"
        type="text"
        slotProps={{
          htmlInput: { inputMode: "decimal" },
        }}
      />
      <SelectField
        control={form.control}
        name="type"
        label="Item Type"
        none=""
        options={ITEM_TYPE_OPTIONS}
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
          none=""
          options={LOCATION_OPTIONS}
          disabled={lockType}
        />
      )}
    </>
  );
}
