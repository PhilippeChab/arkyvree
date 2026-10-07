import { Button, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper } from "@mui/material";
import type { ReactNode } from "react";

import {
  DialogFooter,
  DiceSpinner,
  InlineConfirm,
  Modal,
  ValidationIssuesAlert,
} from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import type { LevelWizard } from "./levelUp/index.ts";

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

/** The part of a level wizard the dialog drives: steps, cancel, validation and navigation. */
type WizardControls = Pick<
  LevelWizard,
  | "activeStep"
  | "showCancelConfirm"
  | "setShowCancelConfirm"
  | "handleConfirmCancel"
  | "validationErrors"
  | "setValidationErrors"
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
        <InlineConfirm
          open={wizard.showCancelConfirm}
          cancelLabel="Keep Editing"
          confirmLabel="Discard"
          onCancel={() => wizard.setShowCancelConfirm(false)}
          onConfirm={wizard.handleConfirmCancel}
          pending={isSaving}
        >
          Discard all level-up progress?
        </InlineConfirm>
        <ValidationIssuesAlert
          issues={wizard.validationErrors}
          title="Validation warnings"
          onClose={() => wizard.setValidationErrors([])}
          onProceed={wizard.handleForceSubmit}
          pending={isSaving}
          gutter={2}
        />

        <Stack spacing={3} sx={{ flex: 1, minHeight: 0 }}>
          {/* Stepper */}
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

          {/* Step content */}
          <Stack sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>{children}</Stack>
        </Stack>
      </Stack>
      <DialogFooter onCancel={wizard.handleCancel} pending={isSaving} sx={{ flexShrink: 0 }}>
        {wizard.activeStep !== 0 && (
          <Button onClick={wizard.handleBack} disabled={isSaving}>
            Back
          </Button>
        )}
        <Button onClick={wizard.handleNext} disabled={wizard.isNextDisabled || isSaving}>
          <DiceSpinner size="small" loading={isSaving}>
            {wizard.isLastStep ? finishLabel : "Next"}
          </DiceSpinner>
        </Button>
      </DialogFooter>
    </Modal>
  );
}
