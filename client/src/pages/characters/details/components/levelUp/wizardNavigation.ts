/**
 * A level wizard's way through its steps, every wizard's alike: Back, Next, the last step's save, a save forced past the
 * rules' warnings, and Cancel, which asks before it discards the wizard's progress.
 */

import type { Dispatch, SetStateAction } from "react";

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
  isLastStep: boolean;
  setActiveStep: Dispatch<SetStateAction<number>>;
  setIssues: (issues: ApiValidationIssue[]) => void;
  setShowCancelConfirm: (show: boolean) => void;
}

/** The wizard's Back, Next, forced save and Cancel, which its dialog's buttons and its warnings' Proceed Anyway take. */
export function navigationOf({ hasProgress, onClose, reset, save, wizard }: NavigationParams) {
  const { isLastStep, setActiveStep, setIssues, setShowCancelConfirm } = wizard;
  return {
    handleBack: () => {
      setIssues([]);
      setActiveStep((prev) => prev - 1);
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
      else setActiveStep((prev) => prev + 1);
    },
  };
}
