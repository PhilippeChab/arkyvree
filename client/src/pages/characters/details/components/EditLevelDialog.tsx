import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { getLevelWizards } from "./levelUpFactory.ts";
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

/** Edit Level: its base rules' wizard, its steps (those the ruleset lists for the level among them) shown by name. */
export function EditLevelDialog({
  open,
  onClose,
  onExited,
  characterId,
  baseRules,
  editingLevel,
}: EditLevelDialogProps) {
  const { editSteps, useEditLevelWizard } = getLevelWizards(baseRules);
  const wizard = useEditLevelWizard({ open, onClose, characterId, editingLevel });
  const Step = editSteps[wizard.steps[wizard.activeStep].name];

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
