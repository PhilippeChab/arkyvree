import { Button, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper } from "@mui/material";
import type { ComponentType } from "react";

import { ValidationIssuesAlert } from "@/client/src/components/characters/index.ts";
import { ConfirmDialog, DialogFooter, LoadError, Modal } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import type { LevelStepProps } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";
import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface LevelWizardDialogProps<N extends string, W extends WizardControls<N>> {
  /** The character's, which its steps read */
  baseRules: BaseRules;
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
  baseRules,
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

            <Stack sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              {wizard.loadError ? (
                <LoadError what={wizard.loadError.what} error={wizard.loadError.error} />
              ) : (
                <ActiveStep wizard={wizard} characterId={characterId} baseRules={baseRules} />
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
        message="Are you sure you want to discard all level-up progress? The choices made in this wizard are lost."
        confirmLabel="Discard Progress"
        intent="destructive"
      />
    </>
  );
}
