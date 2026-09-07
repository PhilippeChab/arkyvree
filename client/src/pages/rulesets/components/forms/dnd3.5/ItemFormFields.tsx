import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { ITEM_TYPE_OPTIONS, SLOT_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { MenuItem, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { DECIMAL_PATTERN, type ItemFormInternal } from "./itemForm.ts";

function isTypeWithTemplate(type?: string) {
  return type === "Weapon" || type === "Armor" || type === "Shield";
}

function TemplateSelector({ form, rulesetId, type }: { form: UseFormReturn<ItemFormInternal>; rulesetId: string; type: string }) {
  const { data: templates, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, `templates-${type}`),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].templates.$get({
        param: { id: rulesetId },
        query: { type: type as "Weapon" | "Armor" | "Shield" },
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  const rawValue = form.watch("sourceItemId" as keyof ItemFormInternal) || "";
  const value = !templates ? rawValue : rawValue && templates.some((t) => t.id === rawValue) ? rawValue : "";

  return (
    <TextField
      name="sourceItemId"
      label={`${type} Template`}
      fullWidth
      select
      value={value}
      onChange={(e) => form.setValue("sourceItemId" as keyof ItemFormInternal, e.target.value as never, { shouldDirty: true })}
      disabled={isLoading}
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
}

export function ItemFormFields({ form, rulesetId }: ItemFormFieldsProps) {
  const itemType = form.watch("type") as string | undefined;
  const slot = form.watch("slot") as string | undefined;

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value;
    form.setValue("type", newType as ItemFormInternal["type"], { shouldDirty: true });
    if (isTypeWithTemplate(newType)) {
      form.setValue("slot", "", { shouldDirty: true });
      form.setValue("sourceItemId" as keyof ItemFormInternal, "" as never, { shouldDirty: true });
    }
  };

  return (
    <>
      <TextField
        {...form.register("name", { required: "Name is required" })}
        label="Name"
        fullWidth
        error={!!form.formState.errors.name}
        helperText={form.formState.errors.name?.message}
      />
      <TextField
        {...form.register("description")}
        label="Description"
        fullWidth
        multiline
        minRows={3}
        sx={{ "& textarea": { resize: "vertical" } }}
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
      >
        <MenuItem value="">None</MenuItem>
        {ITEM_TYPE_OPTIONS.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
        ))}
      </TextField>
      {isTypeWithTemplate(itemType)
        ? <TemplateSelector form={form} rulesetId={rulesetId} type={itemType!} />
        : (
          <TextField
            {...form.register("slot")}
            label="Slot"
            fullWidth
            select
            value={slot || ""}
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
