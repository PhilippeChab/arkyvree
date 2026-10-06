import { useController, type UseFormReturn } from "react-hook-form";

import { ConfirmDialog, CreateDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useRulesetSaves } from "@/client/src/hooks/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { CreateLevelFormData } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { allLevelSaves, ClassLevelFields } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";

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
  const { field: saves } = useController({ control: form.control, name: "saves" });
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
        rules={wholeNumberRules(1, "Level is required", 20)}
        number
        label="Level"
        type="number"
      />
      <FormTextField
        control={form.control}
        name="bab"
        rules={wholeNumberRules(0, "Base Attack Bonus is required")}
        number
        label="Base Attack Bonus"
        type="number"
      />
      <FormTextField
        control={form.control}
        name="skills"
        rules={wholeNumberRules(1, "Skill points are required")}
        number
        label="Skill Points"
        type="number"
      />
      <ClassLevelFields
        rulesetId={rulesetId}
        saves={saves.value ?? []}
        onSavesChange={saves.onChange}
        feats={feats.value ?? []}
        onFeatsChange={feats.onChange}
      />
    </CreateDialog>
  );
}

export function RemoveSkillDialog(props: ConfirmActionProps) {
  return (
    <ConfirmDialog
      {...props}
      confirmColor="error"
      title="Remove Skill"
      message="Are you sure you want to remove this skill from the class?"
      confirmLabel="Remove"
    />
  );
}
