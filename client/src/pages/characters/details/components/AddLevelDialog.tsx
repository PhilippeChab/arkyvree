import type { BaseRules } from "@/shared/enums.ts";

import { ADD_STEP_CONTENT, ADD_STEP_LABELS, useAddLevelWizard } from "./dnd3.5/levelUp/index.ts";
import { getLevelUpSections } from "./levelUpFactory.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface AddLevelDialogProps {
  baseRules: BaseRules;
  characterId: string;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

export function AddLevelDialog({ open, onClose, onExited, characterId, baseRules }: AddLevelDialogProps) {
  const wizard = useAddLevelWizard({ open, onClose, characterId });
  const Sections = getLevelUpSections(baseRules);

  const renderStepContent = () => {
    switch (ADD_STEP_CONTENT[wizard.activeStep]) {
      case "class-plan":
        return <Sections.AddClassPlanStep wizard={wizard} />;
      case "hp":
        return <Sections.HpStep wizard={wizard} />;
      case "abilities":
        return <Sections.AddAbilityStep wizard={wizard} baseRules={baseRules} />;
      case "skills":
        return <Sections.SkillsStep wizard={wizard} />;
      case "feats":
        return <Sections.FeatsStep wizard={wizard} characterId={characterId} />;
      case "powers":
        return <Sections.PowersStep wizard={wizard} />;
      case "review":
        return <Sections.AddReviewStep wizard={wizard} />;
    }
  };

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Add Level"
      wizard={wizard}
      stepLabels={ADD_STEP_LABELS}
      finishLabel="Finish All"
      isSaving={wizard.finalizeMutation.isPending}
    >
      {renderStepContent()}
    </LevelWizardDialog>
  );
}
