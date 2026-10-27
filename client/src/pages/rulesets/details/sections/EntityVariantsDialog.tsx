import { DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import {
  AddButton,
  DialogFooter,
  FormDialog,
  FormTextField,
  RowAction,
  TextAreaField,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetRules } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import { formSectionsOf } from "@/client/src/pages/rulesets/components/forms/index.ts";

import { type EntityVariantsFormValues, type VariantRow, variantRow } from "./entityVariants.ts";

interface EntityVariantsDialogProps {
  baseDescription?: string | null;
  baseName: string;
  /** Its kind's type (`items`), whose word and fields it names */
  entityType: string;
  /** Reset by the caller before opening, with `variantRow(entity, 1)`. */
  form: UseFormReturn<EntityVariantsFormValues>;
  /** The most variants it makes at once (its kind's `copies.most`) */
  most: number;
  onClose: () => void;
  onSubmit: (variants: VariantRow[]) => void;
  open: boolean;
  pending: boolean;
  /** The ruleset's, whose rules name its kind and what a variant copies */
  rulesetId: string;
}

/** A list of words as a sentence names them, "a, b and c". */
const COPIED_LIST = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

/** A kind's entity's variants' dialog (an item's): their names and descriptions, each copying the entity. */
export function EntityVariantsDialog({
  open,
  onClose,
  baseName,
  baseDescription,
  entityType,
  form,
  most,
  onSubmit,
  pending,
  rulesetId,
}: EntityVariantsDialogProps) {
  const { rules } = useRulesetRules(rulesetId);
  const one = entityTypeLabel(entityType, rules?.words).toLowerCase();
  // What a variant copies of its base entity: the fields beside its name, as its rules name them ("cost, weight, item
  // type…")
  const copied = COPIED_LIST.format([
    ...new Set(formSectionsOf(rules?.fields[entityType] ?? []).beside.map((field) => field.label.toLowerCase())),
  ]);
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variants",
  });

  const submit = (values: EntityVariantsFormValues) => {
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
        <DialogTitle>Create Variants of {baseName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText>
              Each variant copies the base {one}'s {copied}, and its modifiers and requirements unless the base {one} is
              a template itself. You'll be able to customize them individually after.
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
                    <TextAreaField
                      control={form.control}
                      name={`variants.${index}.description`}
                      label="Description"
                      size="small"
                      rows={1}
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
              onClick={() => append(variantRow({ name: baseName, description: baseDescription }, fields.length + 1))}
              disabled={fields.length >= most || pending}
              sx={{ alignSelf: "flex-start" }}
            />
          </Stack>
        </DialogContent>
        <DialogFooter
          onCancel={onClose}
          pending={pending}
          action={{ label: `Create ${formatCount(fields.length, "Variant")}` }}
        />
      </form>
    </FormDialog>
  );
}
