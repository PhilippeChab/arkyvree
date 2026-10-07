import { useController, type UseFormReturn } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useRulesetSaves } from "@/client/src/hooks/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import {
  allLevelSaves,
  areSaveBasesValid,
  ClassLevelFields,
  type CreateLevelFormData,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { MAX_CLASS_LEVEL } from "@/shared/dnd3.5/classes.ts";

interface ConfirmActionProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

interface CreateLevelDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CreateLevelFormData>;
  onSubmit: (data: CreateLevelFormData) => void;
  isLoading: boolean;
  rulesetId: string;
}

export function CreateLevelDialog({ open, onClose, form, onSubmit, isLoading, rulesetId }: CreateLevelDialogProps) {
  const { data: rulesetSaves } = useRulesetSaves(rulesetId, open);
  const { field: saves, fieldState: savesState } = useController({
    control: form.control,
    name: "saves",
    rules: { validate: areSaveBasesValid },
  });
  const { field: feats } = useController({ control: form.control, name: "feats" });

  // The endpoint takes every ruleset save, 0 when unset.
  const handleSubmit = (data: CreateLevelFormData) =>
    onSubmit({ ...data, saves: allLevelSaves(rulesetSaves, data.saves ?? []) });

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Level"
      form={form}
      onSubmit={handleSubmit}
      isLoading={isLoading}
    >
      <FormTextField
        control={form.control}
        name="level"
        rules={wholeNumberRules(1, "Level is required", MAX_CLASS_LEVEL)}
        number
        label="Level"
        fullWidth
        slotProps={{
          htmlInput: { min: 1, max: MAX_CLASS_LEVEL },
        }}
      />
      <FormTextField
        control={form.control}
        name="bab"
        rules={wholeNumberRules(0, "Base Attack Bonus is required")}
        number
        label="Base Attack Bonus"
        fullWidth
        slotProps={{
          htmlInput: { min: 0 },
        }}
      />
      <FormTextField
        control={form.control}
        name="skills"
        rules={wholeNumberRules(1, "Skill points are required")}
        number
        label="Skill Points"
        fullWidth
        slotProps={{
          htmlInput: { min: 1 },
        }}
      />
      <ClassLevelFields
        rulesetId={rulesetId}
        saves={saves.value ?? []}
        onSavesChange={saves.onChange}
        savesInvalid={!!savesState.error}
        feats={feats.value ?? []}
        onFeatsChange={feats.onChange}
      />
    </CreateDialog>
  );
}

export function RemoveSkillDialog({ ...props }: ConfirmActionProps) {
  return (
    <DeleteDialog
      {...props}
      title="Remove Skill"
      message="Are you sure you want to remove this skill from the class?"
      confirmLabel="Remove"
    />
  );
}
