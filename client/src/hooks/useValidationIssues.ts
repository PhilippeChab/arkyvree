import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { ApiError, type ApiValidationIssue } from "@/client/src/services/rpc.ts";
import { useCallback, useState } from "react";

/**
 * A save the server can refuse with rules warnings: those show in the form
 * (which can then save anyway, with `force`); any other failure is a toast.
 */
export function useValidationIssues(fallback?: string) {
  const snackbar = useSnackbar();
  const [validationErrors, setValidationErrors] = useState<ApiValidationIssue[]>([]);

  const handleSaveError = useCallback((error: Error) => {
    if (error instanceof ApiError && error.issues && error.issues.length > 0) {
      setValidationErrors(error.issues);
    } else {
      snackbar.error(error, fallback);
    }
  }, [snackbar, fallback]);

  return { validationErrors, setValidationErrors, handleSaveError };
}
