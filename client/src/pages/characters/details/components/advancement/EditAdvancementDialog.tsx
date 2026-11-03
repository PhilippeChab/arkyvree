import { AdvancementWizardDialog, type EditAdvancementDialogProps } from "./AdvancementWizardDialog.tsx";
import { useEditAdvancementWizard } from "./useEditAdvancementWizard.ts";

/** Edit Level: its wizard, the steps its ruleset lists for the advancement, each by its mechanic. */
export function EditAdvancementDialog({
  open,
  onClose,
  onExited,
  characterId,
  editingAdvancement,
  words,
}: EditAdvancementDialogProps) {
  const wizard = useEditAdvancementWizard({ open, onClose, characterId, editingAdvancement, words });

  return (
    <AdvancementWizardDialog
      open={open}
      onExited={onExited}
      title={words.edit}
      wizard={wizard}
      finishLabel="Finish"
      characterId={characterId}
    />
  );
}
