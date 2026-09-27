import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon } from "@mui/icons-material";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { DiceSpinner, FormDialog } from "@/client/src/components/common/index.ts";
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
      <form onSubmit={form.handleSubmit(submit)}>
        <DialogTitle>Create variants of {baseItemName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Each variant copies the base item's cost, weight, type, and slot.
              You'll be able to customize them individually after.
            </Typography>
            <Stack spacing={3}>
              {fields.map((field, index) => (
                <Box
                  key={field.id}
                  sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
                >
                  <Stack spacing={1} sx={{ flex: 1 }}>
                    <TextField
                      {...form.register(`variants.${index}.name`, {
                        required: "Name is required",
                      })}
                      label="Name"
                      size="small"
                      fullWidth
                      error={!!form.formState.errors.variants?.[index]?.name}
                      helperText={form.formState.errors.variants?.[index]?.name?.message}
                    />
                    <TextField
                      {...form.register(`variants.${index}.description`)}
                      label="Description"
                      size="small"
                      fullWidth
                      multiline
                      minRows={1}
                    />
                  </Stack>
                  <Tooltip title="Remove variant">
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Remove variant"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1 || isLoading}
                        sx={{ mt: 0.5 }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => append(variantRow({ name: baseItemName, description: baseItemDescription }, fields.length + 1))}
              disabled={fields.length >= MAX_VARIANTS || isLoading}
              sx={{ alignSelf: "flex-start" }}
            >
              Add variant
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
      </form>
    </FormDialog>
  );
}
