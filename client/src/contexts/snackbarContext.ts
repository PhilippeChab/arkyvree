/** The toasts' context: what `useSnackbar` hands a component, which `SnackbarProvider` provides. */

import { createContext } from "react";

export interface SnackbarContextType {
  /**
   * Show an error toast: the caught error's message, or `fallback`, which names what failed ("Failed to archive
   * campaign"), when it carries none.
   */
  error: (err: unknown, fallback: string) => void;
  info: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
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
