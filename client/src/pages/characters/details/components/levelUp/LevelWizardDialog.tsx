import { Button, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper } from "@mui/material";
import type { ComponentType } from "react";

import { type EditingLevel, ValidationIssuesAlert } from "@/client/src/components/characters/index.ts";
import { ConfirmDialog, DialogFooter, LoadError, Modal } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";

interface LevelWizardDialogProps<N extends string, W extends WizardControls<N>> {
  characterId: string;
  /** The last step's button ("Finish"). */
  finishLabel: string;
  /** It has faded out (`useDialogState`'s `onExited`): its owner unmounts it. */
  onExited: () => void;
  open: boolean;
  /** Its steps' components, by the name its wizard lists each by: the one it's at shows */
  steps: Record<N, ComponentType<LevelStepProps<W>>>;
  title: string;
  wizard: W;
}

/**
 * The part of a level wizard, Add Level's or Edit Level's, the dialog drives: its steps (their names and labels, in
 * order), what failed to load (`loadError`, which it shows in place of the step), cancel, validation, navigation and
 * the save running.
 */
interface WizardControls<N extends string> {
  activeStep: number;
  handleBack: () => void;
  handleCancel: () => void;
  handleConfirmCancel: () => void;
  handleForceSubmit: () => void;
  handleNext: () => void;
  isLastStep: boolean;
  isNextDisabled: boolean;
  isSaving: boolean;
  issues: ApiValidationIssue[];
  loadError: { error: Error; what: string } | undefined;
  setIssues: (issues: ApiValidationIssue[]) => void;
  setShowCancelConfirm: (show: boolean) => void;
  showCancelConfirm: boolean;
  steps: readonly { label: string; name: N }[];
}

/** What a character's sheet passes its Add Level dialog: a level dialog's, and the class it opens with planned. */
export interface AddLevelDialogProps extends LevelDialogProps {
  /**
   * The class it plans for the next level as it opens (a class's plus, on the sheet's header), as the class's quick-add
   * button would: none opens an empty plan
   */
  klassId?: string;
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

/** What a level wizard's step takes: the wizard's state, and the character it levels. */
export interface LevelStepProps<W> {
  characterId: string;
  wizard: W;
}

/**
 * The Add Level / Edit Level dialog: stepper, the step its wizard is at (`steps`, by its name), cancel confirmation,
 * validation warnings and navigation.
 */
export function LevelWizardDialog<N extends string, W extends WizardControls<N>>({
  open,
  onExited,
  title,
  wizard,
  steps,
  finishLabel,
  characterId,
}: LevelWizardDialogProps<N, W>) {
  const isMobile = useIsMobile();
  const { isSaving } = wizard;
  const ActiveStep: ComponentType<LevelStepProps<W>> = steps[wizard.steps[wizard.activeStep].name];

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
              {wizard.steps.map(({ label }) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {/* Its sides padded: a scrolling box clips what draws past its edge (a radio's or a checkbox's circle, a
                rolled field's settling ring) */}
            <Stack sx={{ flex: 1, overflow: "auto", minHeight: 0, px: 1.5 }}>
              {wizard.loadError ? (
                <LoadError what={wizard.loadError.what} error={wizard.loadError.error} />
              ) : (
                <ActiveStep wizard={wizard} characterId={characterId} />
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
