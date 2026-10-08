import { Typography } from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { ADD_STEP_CONTENT, ADD_STEP_LABELS, availableClassesQuery, useAddLevelWizard } from "./dnd3.5/levelUp/index.ts";
import { getLevelUpSections } from "./levelUpFactory.ts";
import { LevelWizardDialog } from "./LevelWizardDialog.tsx";

interface AddLevelModalProps {
  baseRules: BaseRules;
  characterId: string;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

export function AddLevelModal({ open, onClose, onExited, characterId, baseRules }: AddLevelModalProps) {
  const wizard = useAddLevelWizard({ open, onClose, characterId });

  const [klassSearch, setKlassSearch] = useState("");
  const debouncedKlassSearch = useDebouncedValue(klassSearch);

  const {
    items: availableKlasses,
    isLoading: isLoadingKlasses,
    error: klassesError,
    onScroll: handleKlassListScroll,
  } = useListboxQuery({
    ...availableClassesQuery(characterId, debouncedKlassSearch, wizard.classPicker),
    enabled: open && wizard.activeStep === 0,
    // Adding a class to the plan re-keys the query, which would drop the
    // data while it refetches. Keep the previous result visible so the
    // quick-add buttons don't flash.
    placeholderData: keepPreviousData,
  });

  // Quick-add buttons show the character's existing classes — they must not
  // follow the search (otherwise searching "bard" drops the "+ Fighter" etc.
  // buttons). Snapshot the unfiltered response and fall back to the snapshot
  // whenever search is active OR the current response is empty (e.g. mid-
  // refetch during any query-key churn that slipped past keepPreviousData).
  const [quickAddSnapshot, setQuickAddSnapshot] = useState<typeof availableKlasses>([]);
  const hasUnfilteredKlasses = !debouncedKlassSearch && availableKlasses.length > 0;
  if (hasUnfilteredKlasses && availableKlasses !== quickAddSnapshot) setQuickAddSnapshot(availableKlasses);

  const quickAddKlasses = hasUnfilteredKlasses ? availableKlasses : quickAddSnapshot;

  // Deferred step (minimum 300ms spinner before heavy render)
  const [renderedStep, setRenderedStep] = useState(wizard.activeStep);

  useEffect(() => {
    if (renderedStep !== wizard.activeStep) {
      const id = setTimeout(() => setRenderedStep(wizard.activeStep), 300);
      return () => clearTimeout(id);
    }
  }, [wizard.activeStep, renderedStep]);

  const Sections = getLevelUpSections(baseRules);

  const stepTransitioning = renderedStep !== wizard.activeStep;

  const renderStepContent = (step: number) => {
    if (stepTransitioning) return <DiceSpinner />;
    const contentType = ADD_STEP_CONTENT[step];

    switch (contentType) {
      case "class-plan":
        return (
          <Sections.AddClassPlanStep
            wizard={wizard}
            availableKlasses={availableKlasses}
            quickAddKlasses={quickAddKlasses}
            isLoadingKlasses={isLoadingKlasses}
            klassesError={klassesError}
            handleKlassListScroll={handleKlassListScroll}
            setKlassSearch={setKlassSearch}
          />
        );
      case "hp":
        return <Sections.HpStep wizard={wizard} />;
      case "attributes":
        return <Sections.AddAttributeStep wizard={wizard} baseRules={baseRules} />;
      case "skills":
        return <Sections.SkillsStep wizard={wizard} />;
      case "feats":
        return <Sections.FeatsStep wizard={wizard} characterId={characterId} />;
      case "powers":
        return <Sections.PowersStep wizard={wizard} />;
      case "review":
        return <Sections.AddReviewStep wizard={wizard} />;
      default:
        return <Typography>Unknown step</Typography>;
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
      {renderStepContent(wizard.activeStep)}
    </LevelWizardDialog>
  );
}
