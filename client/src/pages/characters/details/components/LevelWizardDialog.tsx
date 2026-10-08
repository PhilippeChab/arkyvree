import { Button, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper } from "@mui/material";
import type { ReactNode } from "react";

import { ValidationIssuesAlert } from "@/client/src/components/characters/index.ts";
import { ConfirmDialog, DialogFooter, Modal } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import type { AddLevelWizard, EditLevelWizard } from "./dnd3.5/levelUp/index.ts";

interface LevelWizardDialogProps {
  /** The current step. */
  children: ReactNode;
  /** The last step's button ("Finish"). */
  finishLabel: string;
  isSaving: boolean;
  /** It has faded out (`useDialogState`'s `onExited`): its owner unmounts it. */
  onExited: () => void;
  open: boolean;
  stepLabels: readonly string[];
  title: string;
  wizard: WizardControls;
}

/** The part of a level wizard, Add Level's or Edit Level's, the dialog drives: steps, cancel, validation and navigation. */
type WizardControls = Pick<
  AddLevelWizard | EditLevelWizard,
  | "activeStep"
  | "showCancelConfirm"
  | "setShowCancelConfirm"
  | "handleConfirmCancel"
  | "issues"
  | "setIssues"
  | "handleForceSubmit"
  | "handleCancel"
  | "handleBack"
  | "handleNext"
  | "isNextDisabled"
  | "isLastStep"
>;

/** The Add Level / Edit Level dialog: stepper, cancel confirmation, validation warnings and navigation. */
export function LevelWizardDialog({
  open,
  onExited,
  title,
  wizard,
  stepLabels,
  finishLabel,
  isSaving,
  children,
}: LevelWizardDialogProps) {
  const isMobile = useIsMobile();

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
            title="Validation warnings"
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
              {stepLabels.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Stack sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>{children}</Stack>
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
        isLoading={isSaving}
        title="Discard Progress"
        message="Are you sure you want to discard all level-up progress? The choices made in this wizard are lost."
        confirmLabel="Discard Progress"
        intent="destructive"
      />
    </>
  );
}
