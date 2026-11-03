import { type AddAdvancementDialogProps, AdvancementWizardDialog } from "./AdvancementWizardDialog.tsx";
import { PlanStep } from "./PlanStep.tsx";
import { useAddAdvancementWizard } from "./useAddAdvancementWizard.ts";

/**
 * Add Level: its wizard, its plan first, then the steps its ruleset lists for new advancements, each by its mechanic.
 */
export function AddAdvancementDialog({
  open,
  onClose,
  onExited,
  characterId,
  trackId,
  words,
}: AddAdvancementDialogProps) {
  const wizard = useAddAdvancementWizard({ open, onClose, characterId, trackId, words });

  return (
    <AdvancementWizardDialog
      open={open}
      onExited={onExited}
      title={words.add}
      wizard={wizard}
      renderPlan={(step) => <PlanStep step={step} wizard={wizard} characterId={characterId} />}
      finishLabel="Finish All"
      characterId={characterId}
    />
  );
}
