import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { DiceSpinner, FormDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { AddIcon, CloseIcon } from "@/client/src/components/icons/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";

import { type BulkVariantsFormValues, type VariantRow, variantRow } from "./bulkVariants.ts";

interface BulkVariantsDialogProps {
  open: boolean;
  onClose: () => void;
  baseItemName: string;
  baseItemDescription?: string | null;
  /** Reset by the caller before opening, with `variantRow(item, 1)`. */
  form: UseFormReturn<BulkVariantsFormValues>;
  onSubmit: (variants: VariantRow[]) => void;
  isLoading: boolean;
}

const MAX_VARIANTS = 50;

export function BulkVariantsDialog({
  open,
  onClose,
  baseItemName,
  baseItemDescription,
  form,
  onSubmit,
  isLoading,
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
      isLoading={isLoading}
      maxWidth="md"
      slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}
    >
      <Stack component="form" onSubmit={form.handleSubmit(submit)} noValidate>
        <DialogTitle>Create Variants of {baseItemName}</DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            <DialogContentText>
              Each variant copies the base item's cost, weight, type, and slot. You'll be able to customize them
              individually after.
            </DialogContentText>
            <Stack spacing={3} divider={<Divider />}>
              {fields.map((field, index) => (
                <Stack key={field.id} spacing={3}>
                  <FormTextField
                    control={form.control}
                    name={`variants.${index}.name`}
                    rules={{
                      required: "Name is required",
                    }}
                    label="Name"
                    slotProps={{
                      input: {
                        endAdornment: (
                          <Tooltip title="Remove variant">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Remove variant"
                                onClick={() => remove(index)}
                                disabled={fields.length === 1 || isLoading}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ),
                      },
                    }}
                  />
                  <FormTextField
                    control={form.control}
                    name={`variants.${index}.description`}
                    label="Description"
                    multiline
                    minRows={1}
                  />
                </Stack>
              ))}
            </Stack>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() =>
                append(variantRow({ name: baseItemName, description: baseItemDescription }, fields.length + 1))
              }
              disabled={fields.length >= MAX_VARIANTS || isLoading}
              sx={{ alignSelf: "flex-start" }}
            >
              Add Variant
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            <DiceSpinner size="small" loading={isLoading}>
              {`Create ${formatCount(fields.length, "variant")}`}
            </DiceSpinner>
          </Button>
        </DialogActions>
      </Stack>
    </FormDialog>
  );
}
