import { DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { AddButton, DialogFooter, FormDialog, FormTextField, RowAction } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import { MAX_ITEM_VARIANTS } from "@/shared/itemTemplates.ts";

import { type BulkVariantsFormValues, type VariantRow, variantRow } from "./bulkVariants.ts";

interface BulkVariantsDialogProps {
  baseItemDescription?: string | null;
  baseItemName: string;
  /** Reset by the caller before opening, with `variantRow(item, 1)`. */
  form: UseFormReturn<BulkVariantsFormValues>;
  onClose: () => void;
  onSubmit: (variants: VariantRow[]) => void;
  open: boolean;
  pending: boolean;
}

export function BulkVariantsDialog({
  open,
  onClose,
  baseItemName,
  baseItemDescription,
  form,
  onSubmit,
  pending,
}: BulkVariantsDialogProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variants",
  });

  const submit = (values: BulkVariantsFormValues) => {
    onSubmit(
      values.variants.map((v) => ({
        name: v.name.trim(),
        description: v.description?.trim() || undefined,
      })),
    );
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      pending={pending}
      slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}
    >
      <form onSubmit={form.handleSubmit(submit)} noValidate>
        <DialogTitle>Create Variants of {baseItemName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText>
              Each variant copies the base item's cost, weight, type, and slot. You'll be able to customize them
              individually after.
            </DialogContentText>
            <Stack spacing={3}>
              {fields.map((field, index) => (
                <Stack key={field.id} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                  <Stack spacing={1} sx={{ flex: 1 }}>
                    <FormTextField
                      control={form.control}
                      name={`variants.${index}.name`}
                      rules={NAME_RULES}
                      label="Name"
                      size="small"
                      fullWidth
                    />
                    <FormTextField
                      control={form.control}
                      name={`variants.${index}.description`}
                      label="Description"
                      size="small"
                      fullWidth
                      multiline
                      minRows={1}
                    />
                  </Stack>
                  {/* Level with its name field */}
                  <Stack sx={{ pt: 0.5 }}>
                    <RowAction
                      icon={DeleteIcon}
                      label="Remove Variant"
                      intent="destructive"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1 || pending}
                    />
                  </Stack>
                </Stack>
              ))}
            </Stack>
            <AddButton
              variant="outlined"
              label="Add Variant"
              onClick={() =>
                append(variantRow({ name: baseItemName, description: baseItemDescription }, fields.length + 1))
              }
              disabled={fields.length >= MAX_ITEM_VARIANTS || pending}
              sx={{ alignSelf: "flex-start" }}
            />
          </Stack>
        </DialogContent>
        <DialogFooter
          onCancel={onClose}
          pending={pending}
          action={{ label: `Create ${formatCount(fields.length, "variant")}` }}
        />
      </form>
    </FormDialog>
  );
}
