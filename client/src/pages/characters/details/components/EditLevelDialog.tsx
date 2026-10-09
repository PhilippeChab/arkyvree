import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import { LoadError } from "@/client/src/components/common/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { EDIT_STEP_CONTENT, EDIT_STEP_LABELS, useEditLevelWizard } from "./dnd3.5/levelUp/index.ts";
import { getLevelUpSections } from "./levelUpFactory.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface EditLevelDialogProps {
  baseRules: BaseRules;
  characterId: string;
  editingLevel: EditingLevel;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

export function EditLevelDialog({
  open,
  onClose,
  onExited,
  characterId,
  baseRules,
  editingLevel,
}: EditLevelDialogProps) {
  const wizard = useEditLevelWizard({ open, onClose, characterId, editingLevel });
  const Sections = getLevelUpSections(baseRules);

  const renderStepContent = () => {
    if (!wizard.levelData && wizard.levelError) return <LoadError what="Level" error={wizard.levelError} />;

    switch (EDIT_STEP_CONTENT[wizard.activeStep]) {
      case "hp":
        return <Sections.HpStep wizard={wizard} />;
      case "abilities":
        return <Sections.EditAbilityStep wizard={wizard} baseRules={baseRules} />;
      case "skills":
        return <Sections.SkillsStep wizard={wizard} />;
      case "feats":
        return <Sections.FeatsStep wizard={wizard} characterId={characterId} />;
      case "powers":
        return <Sections.PowersStep wizard={wizard} />;
      case "review":
        return <Sections.EditReviewStep wizard={wizard} />;
    }
  };

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Edit Level"
      wizard={wizard}
      stepLabels={EDIT_STEP_LABELS}
      finishLabel="Finish"
      isSaving={wizard.finalizeMutation.isPending}
    >
      {renderStepContent()}
    </LevelWizardDialog>
  );
}
