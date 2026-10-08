import type { UseFormReturn } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import {
  allLevelSaves,
  ClassLevelFields,
  type ClassLevelFormData,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";
import { MAX_CLASS_LEVEL } from "@/shared/dnd3.5/classes.ts";

interface ConfirmActionProps {
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

interface CreateLevelDialogProps {
  form: UseFormReturn<ClassLevelFormData>;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: ClassLevelFormData) => void;
  open: boolean;
  rulesetId: string;
}

export function CreateLevelDialog({ open, onClose, form, onSubmit, isLoading, rulesetId }: CreateLevelDialogProps) {
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId, open);

  // The endpoint takes every ruleset save, 0 when unset.
  const handleSubmit = (data: ClassLevelFormData) =>
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
      <ClassLevelFields form={form} rulesetId={rulesetId} rulesetSaves={rulesetSaves} savesError={savesError} />
    </CreateDialog>
  );
}

export function RemoveSkillDialog({ ...props }: ConfirmActionProps) {
  return (
    <DeleteDialog
      {...props}
      title="Remove Skill"
      message="Are you sure you want to remove this skill from the class? This action cannot be undone."
      confirmLabel="Remove"
    />
  );
}
