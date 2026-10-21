import type { ComponentType } from "react";

import { AddAbilityStep } from "./AddAbilityStep.tsx";
import { AddClassPlanStep } from "./AddClassPlanStep.tsx";
import { AddReviewStep } from "./AddReviewStep.tsx";
import { FeatsStep } from "./FeatsStep.tsx";
import { HpStep } from "./HpStep.tsx";
import { type AddLevelDialogProps, type LevelStepProps, LevelWizardDialog } from "./LevelWizardDialog.tsx";
import { SkillsStep } from "./SkillsStep.tsx";
import { SpellsStep } from "./SpellsStep.tsx";
import { type AddLevelWizard, useAddLevelWizard } from "./useAddLevelWizard.ts";

/** Add Level's steps, by the name its hook lists each by: its own, and those the ruleset lists for a new level. */
const ADD_STEPS: Record<AddLevelWizard["steps"][number]["name"], ComponentType<LevelStepProps<AddLevelWizard>>> = {
  "class-plan": AddClassPlanStep,
  hp: HpStep,
  abilities: AddAbilityStep,
  skills: SkillsStep,
  feats: FeatsStep,
  powers: SpellsStep,
  review: AddReviewStep,
};

/** Add Level: its wizard, its steps shown by their kind, the name its ruleset lists each by. */
export function AddLevelDialog({ open, onClose, onExited, characterId, klassId }: AddLevelDialogProps) {
  const wizard = useAddLevelWizard({ open, onClose, characterId, klassId });

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Add Level"
      wizard={wizard}
      steps={ADD_STEPS}
      finishLabel="Finish All"
      characterId={characterId}
    />
  );
}
