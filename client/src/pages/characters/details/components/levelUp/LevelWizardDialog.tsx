import { Button, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper } from "@mui/material";
import type { ReactNode } from "react";

import { type EditingLevel, ValidationIssuesAlert } from "@/client/src/components/characters/index.ts";
import { ConfirmDialog, DialogFooter, DiceSpinner, LoadError, Modal } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import { ChooseStep } from "./ChooseStep.tsx";
import type { StepOf } from "./levelPlanQueries.ts";
import { PickStep } from "./PickStep.tsx";
import { ReviewStep } from "./ReviewStep.tsx";
import { SpendStep } from "./SpendStep.tsx";
import type { LevelWizard } from "./useLevelWizard.ts";
import { ValueStep } from "./ValueStep.tsx";

interface LevelWizardDialogProps<W extends WizardControls> {
  characterId: string;
  /** The last step's button ("Finish"). */
  finishLabel: string;
  /** It has faded out (`useDialogState`'s `onExited`): its owner unmounts it. */
  onExited: () => void;
  open: boolean;
  /** Its `plan` step, Add Level's own: an edit's level has its plan */
  renderPlan?: (step: StepOf<"plan">) => ReactNode;
  title: string;
  wizard: W;
}

/**
 * The part of a level wizard, Add Level's or Edit Level's, the dialog drives past the steps' shared state: what failed
 * to load (`loadError`, which it shows in place of the step), cancel, navigation and the save running.
 */
interface WizardControls extends LevelWizard {
  handleBack: () => void;
  handleCancel: () => void;
  handleConfirmCancel: () => void;
  handleForceSubmit: () => void;
  handleNext: () => void;
  isNextDisabled: boolean;
  isSaving: boolean;
  loadError: { error: unknown; what: string } | undefined;
}

/** What a character's sheet passes its Add Level dialog: a level dialog's, and the class it opens with planned. */
export interface AddLevelDialogProps extends LevelDialogProps {
  /**
   * The track it plans for the next advancement as it opens (a class's plus, on the sheet's header), as the track's
   * quick-add button would: none opens an empty plan
   */
  trackId?: string;
}

/** What a character's sheet passes its Edit Level dialog: a level dialog's, and the level it edits. */
export interface EditLevelDialogProps extends LevelDialogProps {
  editingLevel: EditingLevel;
}

/** What a character's sheet passes a level dialog: the character it levels, and the dialog's own state. */
export interface LevelDialogProps {
  characterId: string;
  onClose: () => void;
  /** It has faded out: its owner unmounts it. */
  onExited: () => void;
  open: boolean;
}

/**
 * The Add Level / Edit Level dialog, every ruleset's alike: stepper, the step its wizard is at, shown by its mechanic,
 * cancel confirmation, validation warnings and navigation.
 */
export function LevelWizardDialog<W extends WizardControls>({
  open,
  onExited,
  title,
  wizard,
  renderPlan,
  finishLabel,
  characterId,
}: LevelWizardDialogProps<W>) {
  const isMobile = useIsMobile();
  const { isSaving, step } = wizard;
  const shownStep = () => {
    switch (step.mechanic) {
      case "choose":
        return <ChooseStep key={step.name} step={step} wizard={wizard} />;
      case "pick":
        return <PickStep key={step.name} step={step} wizard={wizard} characterId={characterId} />;
      case "plan":
        return renderPlan?.(step) ?? null;
      case "review":
        return <ReviewStep wizard={wizard} characterId={characterId} />;
      case "spend":
        return <SpendStep key={step.name} step={step} wizard={wizard} characterId={characterId} />;
      case "value":
        return <ValueStep key={step.name} step={step} wizard={wizard} />;
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={(_, reason) => {
          // Discarding mid-save would still save: wait for it.
          if (reason !== "backdropClick" && !isSaving) wizard.handleCancel();
        }}
        maxWidth="md"
        slotProps={{ transition: { onExited } }}
        sx={[!isMobile && { "& .MuiDialog-paper": { height: "90vh", maxHeight: "90vh" } }]}
      >
        <DialogTitle>{title}</DialogTitle>
        <Stack component={DialogContent} sx={{ height: "100%", overflow: "hidden" }}>
          <ValidationIssuesAlert
            issues={wizard.issues}
            title="Validation Warnings"
            onClose={() => wizard.setIssues([])}
            onProceed={wizard.handleForceSubmit}
            pending={isSaving}
            gutter={2}
          />

          <Stack spacing={3} sx={{ flex: 1, minHeight: 0 }}>
            <Stepper
              activeStep={wizard.activeStep}
              alternativeLabel={isMobile}
              sx={[
                {
                  flexShrink: 0,
                  "& .MuiStepLabel-iconContainer": {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  "& svg text": {
                    dominantBaseline: "middle",
                    textAnchor: "middle",
                  },
                },
                isMobile && { "& .MuiStepLabel-label": { fontSize: "0.65rem" } },
              ]}
            >
              {wizard.steps.map(({ label, name }) => (
                <Step key={name}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {/* Its sides padded: a scrolling box clips what draws past its edge (a radio's or a checkbox's circle, a
                rolled field's settling ring) */}
            <Stack sx={{ flex: 1, overflow: "auto", minHeight: 0, px: 1.5 }}>
              {wizard.loadError ? (
                <LoadError what={wizard.loadError.what} error={wizard.loadError.error} />
              ) : wizard.stepsLoaded ? (
                shownStep()
              ) : (
                <DiceSpinner />
              )}
            </Stack>
          </Stack>
        </Stack>
        <DialogFooter
          onCancel={wizard.handleCancel}
          pending={isSaving}
          action={{
            label: wizard.isLastStep ? finishLabel : "Next",
            onClick: wizard.handleNext,
            disabled: wizard.isNextDisabled,
          }}
          sx={{ flexShrink: 0 }}
        >
          {wizard.activeStep !== 0 && (
            <Button onClick={wizard.handleBack} disabled={isSaving}>
              Back
            </Button>
          )}
        </DialogFooter>
      </Modal>
      <ConfirmDialog
        open={wizard.showCancelConfirm}
        onClose={() => wizard.setShowCancelConfirm(false)}
        onConfirm={wizard.handleConfirmCancel}
        pending={isSaving}
        title="Discard Progress"
        message="Are you sure you want to discard your progress? The choices made in this wizard are lost."
        confirmLabel="Discard Progress"
        intent="destructive"
      />
    </>
  );
}
