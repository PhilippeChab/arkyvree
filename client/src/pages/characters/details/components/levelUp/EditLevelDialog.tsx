import type { ComponentType } from "react";

import { EditAbilityStep } from "./EditAbilityStep.tsx";
import { EditReviewStep } from "./EditReviewStep.tsx";
import { FeatsStep } from "./FeatsStep.tsx";
import { HpStep } from "./HpStep.tsx";
import { type EditLevelDialogProps, type LevelStepProps, LevelWizardDialog } from "./LevelWizardDialog.tsx";
import { SkillsStep } from "./SkillsStep.tsx";
import { SpellsStep } from "./SpellsStep.tsx";
import { type EditLevelWizard, useEditLevelWizard } from "./useEditLevelWizard.ts";

/** Edit Level's steps, by the name its hook lists each by: its own, and those the ruleset lists for the level. */
const EDIT_STEPS: Record<EditLevelWizard["steps"][number]["name"], ComponentType<LevelStepProps<EditLevelWizard>>> = {
  hp: HpStep,
  abilities: EditAbilityStep,
  skills: SkillsStep,
  feats: FeatsStep,
  powers: SpellsStep,
  review: EditReviewStep,
};

/** Edit Level: its wizard, its steps shown by their kind, the name its ruleset lists each by. */
export function EditLevelDialog({ open, onClose, onExited, characterId, editingLevel }: EditLevelDialogProps) {
  const wizard = useEditLevelWizard({ open, onClose, characterId, editingLevel });

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Edit Level"
      wizard={wizard}
      steps={EDIT_STEPS}
      finishLabel="Finish"
      characterId={characterId}
    />
  );
}
