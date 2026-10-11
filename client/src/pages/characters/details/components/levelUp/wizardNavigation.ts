/**
 * A level wizard's way through its steps, every wizard's alike: the step it shows, Back, Next, the last step's save, a
 * save forced past the rules' warnings, and Cancel, which asks before it discards the wizard's progress.
 */

import type { ApiValidationIssue } from "@/client/src/services/ApiError.ts";

interface NavigationParams {
  /** Something was picked or planned: Cancel asks before it's discarded */
  hasProgress: boolean;
  onClose: () => void;
  /** Clears what the wizard picked and planned, as it's discarded */
  reset: () => void;
  /** Sends the wizard's save, forced past the rules' warnings or not */
  save: (force: boolean) => void;
  /** Its step, and what a step change clears (`useLevelWizardBase`'s) */
  wizard: StepState;
}

/** A level wizard's step among its steps, and what moving between them changes. */
interface StepState {
  /** The step it shows (`shownStep`), which Back and Next move from */
  activeStep: number;
  isLastStep: boolean;
  setActiveStep: (step: number) => void;
  setIssues: (issues: ApiValidationIssue[]) => void;
  setShowCancelConfirm: (show: boolean) => void;
}

/** The wizard's Back, Next, forced save and Cancel, which its dialog's buttons and its warnings' Proceed Anyway take. */
export function navigationOf({ hasProgress, onClose, reset, save, wizard }: NavigationParams) {
  const { activeStep, isLastStep, setActiveStep, setIssues, setShowCancelConfirm } = wizard;
  return {
    handleBack: () => {
      setIssues([]);
      setActiveStep(activeStep - 1);
    },
    handleCancel: () => {
      if (hasProgress) setShowCancelConfirm(true);
      else onClose();
    },
    handleConfirmCancel: () => {
      reset();
      onClose();
    },
    handleForceSubmit: () => {
      setIssues([]);
      save(true);
    },
    handleNext: () => {
      if (isLastStep) save(false);
      else setActiveStep(activeStep + 1);
    },
  };
}

/**
 * The step a wizard shows among its steps: the one it moved to, or its last once the list has shrunk under it. Its
 * steps are a query's, which can drop the steps the ruleset lists while the wizard is open (the save removes them while
 * the wizard still shows its review), so it never reads a step past their end.
 */
export function shownStep(steps: readonly unknown[], movedTo: number) {
  return Math.min(movedTo, steps.length - 1);
}
