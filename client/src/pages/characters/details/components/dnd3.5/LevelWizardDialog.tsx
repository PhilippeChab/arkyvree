import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";

import {
  AnimatedAlert,
  ConfirmDialog,
  DiceSpinner,
  Modal,
  ValidationIssueList,
} from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

import type { LevelWizard } from "./levelUp/index.ts";

interface LevelWizardDialogProps {
  open: boolean;
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
      slotProps={{ paper: { sx: { height: { sm: "90vh" }, maxHeight: { sm: "90vh" } } } }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ height: "100%", overflow: "hidden" }}>
        <Stack sx={{ height: "100%" }}>
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
            sx={{
              mb: 2,
              "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 },
            }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Validation warnings
            </Typography>
            <ValidationIssueList issues={wizard.validationErrors} />
          </AnimatedAlert>

          {/* Stepper */}
          <Stepper
            activeStep={wizard.activeStep}
            alternativeLabel={isMobile}
            sx={{
              mb: 3,
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
              ...(isMobile && {
                "& .MuiStepLabel-label": {
                  typography: "caption",
                },
              }),
            }}
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
      </DialogContent>
      <DialogActions sx={{ flexShrink: 0 }}>
        <Button onClick={wizard.handleCancel} disabled={isSaving} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Box sx={{ flex: "1 1 auto" }} />
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
      </DialogActions>
      <ConfirmDialog
        open={wizard.showCancelConfirm}
        onClose={() => wizard.setShowCancelConfirm(false)}
        onConfirm={wizard.handleConfirmCancel}
        isLoading={isSaving}
        title="Discard Level Up"
        message="Are you sure you want to discard your level-up progress? This action cannot be undone."
        confirmLabel="Discard"
        confirmColor="error"
      />
    </Modal>
  );
}
