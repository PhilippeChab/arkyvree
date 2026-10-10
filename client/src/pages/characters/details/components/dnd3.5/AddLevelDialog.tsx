import type { ComponentType } from "react";

import type { AddLevelDialogProps } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";
import { LevelWizardDialog } from "@/client/src/pages/characters/details/components/LevelWizardDialog.tsx";

import { AddAbilityStep } from "./AddAbilityStep.tsx";
import { AddClassPlanStep } from "./AddClassPlanStep.tsx";
import { AddReviewStep } from "./AddReviewStep.tsx";
import { FeatsStep } from "./FeatsStep.tsx";
import { HpStep } from "./HpStep.tsx";
import { type AddLevelWizard, type LevelStepProps, useAddLevelWizard } from "./levelUp/index.ts";
import { SkillsStep } from "./SkillsStep.tsx";
import { SpellsStep } from "./SpellsStep.tsx";

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

/** 3.5's Add Level: its wizard, its steps shown by name. */
export function AddLevelDialog({ open, onClose, onExited, characterId, baseRules }: AddLevelDialogProps) {
  const wizard = useAddLevelWizard({ open, onClose, characterId });
  const Step = ADD_STEPS[wizard.steps[wizard.activeStep].name];

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Add Level"
      wizard={wizard}
      finishLabel="Finish All"
      isSaving={wizard.finalizeMutation.isPending}
    >
      <Step wizard={wizard} characterId={characterId} baseRules={baseRules} />
    </LevelWizardDialog>
  );
}
