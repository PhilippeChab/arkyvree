/** The toasts' context: what `useSnackbar` hands a component, which `SnackbarProvider` provides. */

import { createContext } from "react";

interface SnackbarContextType {
  /**
   * Show an error toast: the caught error's message, or `fallback`, which names what failed ("Failed to archive
   * campaign"), when it carries none.
   */
  error: (err: unknown, fallback: string) => void;
  /** A notice, its `action` a button on it (the new version's Refresh), `persistent` until it's dismissed. */
  info: (message: string, options?: ToastOptions) => void;
  success: (message: string) => void;
  warning: (message: string) => void;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  persistent?: boolean;
}

export const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);
