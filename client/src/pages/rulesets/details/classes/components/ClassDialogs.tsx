import type { rpc } from "@/client/src/services/rpc.ts";
import { TextField } from "@mui/material";
import { CreateDialog, DeleteDialog } from "@/client/src/components/common/index.ts";
import { useRulesetSaves } from "@/client/src/hooks/index.ts";
import { allLevelSaves, ClassLevelFields } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

type CreateLevelFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$post"]
>["json"];

interface CreateLevelDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CreateLevelFormData>;
  onSubmit: (data: CreateLevelFormData) => void;
  isLoading: boolean;
  rulesetId: string;
}

export function CreateLevelDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
  rulesetId,
}: CreateLevelDialogProps) {
  const { data: rulesetSaves } = useRulesetSaves(rulesetId, open);

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
      <TextField
        {...form.register("level", {
          required: "Level is required",
          valueAsNumber: true,
        })}
        label="Level"
        type="number"
        fullWidth
        error={!!form.formState.errors.level}
        helperText={form.formState.errors.level?.message}
        slotProps={{
          htmlInput: { min: 1, max: 20 }
        }}
      />
      <TextField
        {...form.register("bab", {
          required: "Base Attack Bonus is required",
          valueAsNumber: true,
        })}
        label="Base Attack Bonus"
        type="number"
        fullWidth
        error={!!form.formState.errors.bab}
        helperText={form.formState.errors.bab?.message}
        slotProps={{
          htmlInput: { min: 0 }
        }}
      />
      <TextField
        {...form.register("skills", {
          required: "Skill points are required",
          valueAsNumber: true,
        })}
        label="Skill Points"
        type="number"
        fullWidth
        error={!!form.formState.errors.skills}
        helperText={form.formState.errors.skills?.message}
        slotProps={{
          htmlInput: { min: 1 }
        }}
      />
      <ClassLevelFields
        rulesetId={rulesetId}
        saves={form.watch("saves") ?? []}
        onSavesChange={(saves) => form.setValue("saves", saves, { shouldDirty: true })}
        feats={form.watch("feats") ?? []}
        onFeatsChange={(feats) => form.setValue("feats", feats, { shouldDirty: true })}
      />
    </CreateDialog>
  );
}

interface ConfirmActionProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function RemoveSkillDialog(props: ConfirmActionProps) {
  return (
    <DeleteDialog
      {...props}
      title="Remove Skill"
      message="Are you sure you want to remove this skill from the class?"
      confirmLabel="Remove"
    />
  );
}
