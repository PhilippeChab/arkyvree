import type { ComponentType } from "react";

import type { EditLevelDialogProps } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";
import { LevelWizardDialog } from "@/client/src/pages/characters/details/components/LevelWizardDialog.tsx";

import { EditAbilityStep } from "./EditAbilityStep.tsx";
import { EditReviewStep } from "./EditReviewStep.tsx";
import { FeatsStep } from "./FeatsStep.tsx";
import { HpStep } from "./HpStep.tsx";
import { type EditLevelWizard, type LevelStepProps, useEditLevelWizard } from "./levelUp/index.ts";
import { SkillsStep } from "./SkillsStep.tsx";
import { SpellsStep } from "./SpellsStep.tsx";

/** Edit Level's steps, by the name its hook lists each by: its own, and those the ruleset lists for the level. */
const EDIT_STEPS: Record<EditLevelWizard["steps"][number]["name"], ComponentType<LevelStepProps<EditLevelWizard>>> = {
  hp: HpStep,
  abilities: EditAbilityStep,
  skills: SkillsStep,
  feats: FeatsStep,
  powers: SpellsStep,
  review: EditReviewStep,
};

/** 3.5's Edit Level: its wizard, its steps shown by name. */
export function EditLevelDialog({
  open,
  onClose,
  onExited,
  characterId,
  baseRules,
  editingLevel,
}: EditLevelDialogProps) {
  const wizard = useEditLevelWizard({ open, onClose, characterId, editingLevel });
  const Step = EDIT_STEPS[wizard.steps[wizard.activeStep].name];

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Edit Level"
      wizard={wizard}
      finishLabel="Finish"
      isSaving={wizard.finalizeMutation.isPending}
    >
      <Step wizard={wizard} characterId={characterId} baseRules={baseRules} />
    </LevelWizardDialog>
  );
}
