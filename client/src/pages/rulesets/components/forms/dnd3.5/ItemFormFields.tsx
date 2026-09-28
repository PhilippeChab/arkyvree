import { nameRules } from "@/client/src/lib/validation.ts";
import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { ITEM_TYPE_OPTIONS, SLOT_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { MenuItem, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { DECIMAL_PATTERN, isTemplateType, type ItemFormInternal, type TemplateType } from "./itemForm.ts";

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

  const rawValue = form.watch("sourceItemId") || "";
  // Empty until the templates load (a value with no option is out of range); one this ruleset no longer has shows as "None".
  const value = templates?.some((t) => t.id === rawValue) ? rawValue : "";

  return (
    <TextField
      name="sourceItemId"
      label={`${type} Template`}
      fullWidth
      select
      value={value}
      onChange={(e) => form.setValue("sourceItemId", e.target.value, { shouldDirty: true })}
      disabled={isLoading || disabled}
    >
      <MenuItem value="">None</MenuItem>
      {templates?.map((t) => (
        <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
      ))}
    </TextField>
  );
}

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormInternal>;
  rulesetId: string;
  /** Keeps the type, slot and template as they are (a duplicate copies them from its source). */
  lockType?: boolean;
}

export function ItemFormFields({ form, rulesetId, lockType }: ItemFormFieldsProps) {
  const itemType = form.watch("type");
  const isTemplate = form.watch("isTemplate");
  const slot = form.watch("slot");

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value;
    form.setValue("type", newType, { shouldDirty: true });
    if (isTemplateType(newType)) {
      form.setValue("slot", "", { shouldDirty: true });
      form.setValue("sourceItemId", "", { shouldDirty: true });
    }
  };

  return (
    <>
      <NameField
        {...form.register("name", nameRules)}
        error={form.formState.errors.name}
      />
      <DescriptionField
        {...form.register("description")}
      />
      <TextField
        {...form.register("costGp", { pattern: DECIMAL_PATTERN })}
        label="Cost (gp)"
        type="text"
        fullWidth
        error={!!form.formState.errors.costGp}
        helperText={form.formState.errors.costGp?.message}
        slotProps={{
          htmlInput: { inputMode: "decimal" }
        }}
      />
      <TextField
        {...form.register("weight", { pattern: DECIMAL_PATTERN })}
        label="Weight (lbs)"
        type="text"
        fullWidth
        error={!!form.formState.errors.weight}
        helperText={form.formState.errors.weight?.message}
        slotProps={{
          htmlInput: { inputMode: "decimal" }
        }}
      />
      <TextField
        name="type"
        label="Item Type"
        fullWidth
        select
        value={itemType || ""}
        onChange={handleTypeChange}
        disabled={lockType}
      >
        <MenuItem value="">None</MenuItem>
        {ITEM_TYPE_OPTIONS.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
        ))}
      </TextField>
      {isTemplateType(itemType)
        ? !isTemplate && <TemplateSelector form={form} rulesetId={rulesetId} type={itemType} disabled={lockType} />
        : (
          <TextField
            {...form.register("slot")}
            label="Slot"
            fullWidth
            select
            value={slot || ""}
            disabled={lockType}
          >
            <MenuItem value="">None</MenuItem>
            {SLOT_OPTIONS.map((slot) => (
              <MenuItem key={slot} value={slot}>{slot}</MenuItem>
            ))}
          </TextField>
        )}
    </>
  );
}
