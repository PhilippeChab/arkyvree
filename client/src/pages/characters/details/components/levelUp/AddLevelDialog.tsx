import { type AddLevelDialogProps, LevelWizardDialog } from "./LevelWizardDialog.tsx";
import { PlanStep } from "./PlanStep.tsx";
import { useAddLevelWizard } from "./useAddLevelWizard.ts";

/** Add Level: its wizard, its plan first, then the steps its ruleset lists for new levels, each by its mechanic. */
export function AddLevelDialog({ open, onClose, onExited, characterId, trackId }: AddLevelDialogProps) {
  const wizard = useAddLevelWizard({ open, onClose, characterId, trackId });

  return (
    <LevelWizardDialog
      open={open}
      onExited={onExited}
      title="Add Level"
      wizard={wizard}
      renderPlan={(step) => <PlanStep step={step} wizard={wizard} characterId={characterId} />}
      finishLabel="Finish All"
      characterId={characterId}
    />
  );
}
