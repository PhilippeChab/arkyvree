import type { ComponentType } from "react";

import { LevelWizardDialog } from "@/client/src/pages/characters/details/components/levelUp/index.ts";
import type {
  AddLevelDialogProps,
  LevelStepProps,
} from "@/client/src/pages/characters/details/components/levelUpFactory.ts";

import { AddAbilityStep } from "./AddAbilityStep.tsx";
import { AddClassPlanStep } from "./AddClassPlanStep.tsx";
import { AddReviewStep } from "./AddReviewStep.tsx";
import { FeatsStep } from "./FeatsStep.tsx";
import { HpStep } from "./HpStep.tsx";
import { type AddLevelWizard, useAddLevelWizard } from "./levelUp/index.ts";
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

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Add Level"
      wizard={wizard}
      steps={ADD_STEPS}
      finishLabel="Finish All"
      characterId={characterId}
      baseRules={baseRules}
    />
  );
}
