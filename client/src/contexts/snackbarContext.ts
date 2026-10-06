/** The toasts' context: what `useSnackbar` hands a component, which `SnackbarProvider` provides. */

import { createContext } from "react";

export interface SnackbarContextType {
  success: (message: string, options?: ToastOptions) => void;
  /**
   * Show an error toast: a message, or what failed (`err`): its message, else `fallback`, which names what failed
   * ("Failed to save character"), so a failure never goes unsaid.
   */
  error: {
    (message: string): void;
    (err: unknown, fallback: string): void;
  };
  info: (message: string, options?: ToastOptions) => void;
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
