import { type EditLevelDialogProps, LevelWizardDialog } from "./LevelWizardDialog.tsx";
import { useEditLevelWizard } from "./useEditLevelWizard.ts";

/** Edit Level: its wizard, the steps its ruleset lists for the level, each by its mechanic. */
export function EditLevelDialog({ open, onClose, onExited, characterId, editingLevel }: EditLevelDialogProps) {
  const wizard = useEditLevelWizard({ open, onClose, characterId, editingLevel });

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Edit Level"
      wizard={wizard}
      finishLabel="Finish"
      characterId={characterId}
    />
  );
}
