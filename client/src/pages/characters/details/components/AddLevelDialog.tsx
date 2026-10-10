import type { BaseRules } from "@/shared/enums.ts";

import { getLevelWizards } from "./levelUpFactory.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface AddLevelDialogProps {
  baseRules: BaseRules;
  characterId: string;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

/** Add Level: its base rules' wizard, its steps (those the ruleset lists for a level among them) shown by name. */
export function AddLevelDialog({ open, onClose, onExited, characterId, baseRules }: AddLevelDialogProps) {
  const { addSteps, useAddLevelWizard } = getLevelWizards(baseRules);
  const wizard = useAddLevelWizard({ open, onClose, characterId });
  const Step = addSteps[wizard.steps[wizard.activeStep].name];

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
