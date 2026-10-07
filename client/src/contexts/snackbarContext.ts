/** The toasts' context: what `useSnackbar` hands a component, which `SnackbarProvider` provides. */

import { createContext } from "react";

export interface SnackbarContextType {
  /**
   * Show an error toast. Accepts a plain string, an Error (uses `.message`),
   * or anything else (falls back to `fallback`).
   */
  error: (err: unknown, fallback?: string) => void;
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
