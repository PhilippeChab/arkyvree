import type { ComponentType } from "react";

import { LevelWizardDialog } from "@/client/src/pages/characters/details/components/levelUp/index.ts";
import type {
  EditLevelDialogProps,
  LevelStepProps,
} from "@/client/src/pages/characters/details/components/levelUpFactory.ts";

import { EditAbilityStep } from "./EditAbilityStep.tsx";
import { EditReviewStep } from "./EditReviewStep.tsx";
import { FeatsStep } from "./FeatsStep.tsx";
import { HpStep } from "./HpStep.tsx";
import { type EditLevelWizard, useEditLevelWizard } from "./levelUp/index.ts";
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

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Edit Level"
      wizard={wizard}
      steps={EDIT_STEPS}
      finishLabel="Finish"
      characterId={characterId}
      baseRules={baseRules}
    />
  );
}
