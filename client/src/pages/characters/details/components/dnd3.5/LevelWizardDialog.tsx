import { Button, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper, Typography } from "@mui/material";
import type { ReactNode } from "react";

import {
  AnimatedAlert,
  DialogFooter,
  DiceSpinner,
  Modal,
  ValidationIssueList,
} from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import type { LevelWizard } from "./levelUp/index.ts";

interface LevelWizardDialogProps {
  open: boolean;
  /** It has faded out (`useDialogState`'s `onExited`): its owner unmounts it. */
  onExited: () => void;
  title: string;
  wizard: WizardControls;
  stepLabels: readonly string[];
  /** The last step's button ("Finish"). */
  finishLabel: string;
  isSaving: boolean;
  /** The current step. */
  children: ReactNode;
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
        {/* Cancel confirm */}
        <AnimatedAlert
          in={wizard.showCancelConfirm}
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => wizard.setShowCancelConfirm(false)}>
                Keep Editing
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={wizard.handleConfirmCancel}
                disabled={isSaving}
              >
                Discard
              </Button>
            </Stack>
          }
          gutter={2}
        >
          Discard all level-up progress?
        </AnimatedAlert>

        {/* Validation errors */}
        <AnimatedAlert
          in={wizard.validationErrors.length > 0}
          severity="warning"
          onClose={() => wizard.setValidationErrors([])}
          action={
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={wizard.handleForceSubmit}
              disabled={isSaving}
              sx={{ whiteSpace: "nowrap" }}
            >
              Proceed Anyway
            </Button>
          }
          gutter={2}
          sx={{ "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 } }}
        >
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" component="h3">
              Validation warnings
            </Typography>
            <ValidationIssueList issues={wizard.validationErrors} />
          </Stack>
        </AnimatedAlert>

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
