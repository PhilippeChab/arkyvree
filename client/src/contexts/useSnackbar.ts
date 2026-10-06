import { useContext } from "react";

import { SnackbarContext } from "./snackbarContext.ts";

/** The toasts: `success`, `error`, `info` and `warning`, each queued and shown in turn. */
export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (context === undefined) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
}
