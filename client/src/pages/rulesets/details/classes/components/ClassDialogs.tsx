import type { UseFormReturn } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import {
  allLevelSaves,
  ClassLevelFields,
  type ClassLevelFormData,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";
import { getVocabulary } from "@/client/src/pages/rulesets/vocabularyFactory.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface CreateLevelDialogProps {
  /** The ruleset's, whose last class level bounds the level's number. */
  baseRules: BaseRules;
  form: UseFormReturn<ClassLevelFormData>;
  onClose: () => void;
  onSubmit: (data: ClassLevelFormData) => void;
  open: boolean;
  pending: boolean;
  rulesetId: string;
}

interface RemoveSkillDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  /** The removal can be undone from Local Changes: the class is inherited, or a copy of one (`useRestorableDelete`). */
  restorable: boolean;
}

export function CreateLevelDialog({
  open,
  onClose,
  form,
  onSubmit,
  pending,
  rulesetId,
  baseRules,
}: CreateLevelDialogProps) {
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId, open);
  const { lastLevel } = getVocabulary(baseRules).classes;

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
      pending={pending}
    >
      <FormTextField
        control={form.control}
        name="level"
        rules={wholeNumberRules(1, "Level is required", lastLevel)}
        number
        label="Level"
        fullWidth
        slotProps={{
          htmlInput: { min: 1, max: lastLevel },
        }}
      />
      <FormTextField
        control={form.control}
        name="fields.bab"
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
        name="fields.skills"
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

export function RemoveSkillDialog({ restorable, ...props }: RemoveSkillDialogProps) {
  return (
    <DeleteDialog
      {...props}
      title="Remove Skill"
      message={
        restorable
          ? "Are you sure you want to remove this skill from the class? You can restore it from Local Changes."
          : "Are you sure you want to remove this skill from the class? This action cannot be undone."
      }
      confirmLabel="Remove Skill"
    />
  );
}
