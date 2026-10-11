import { useCallback, useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { ApiError, type ApiValidationIssue } from "@/client/src/services/ApiError.ts";

/**
 * A save the server can refuse with rules warnings: those show in the form
 * (which can then save anyway, with `force`); any other failure is a toast, `fallback` naming what failed.
 */
export function useValidationIssues(fallback: string) {
  const snackbar = useSnackbar();
  const [issues, setIssues] = useState<ApiValidationIssue[]>([]);

  const handleSaveError = useCallback(
    (error: Error) => {
      if (error instanceof ApiError && error.issues && error.issues.length > 0) setIssues(error.issues);
      else snackbar.error(error, fallback);
    },
    [snackbar, fallback],
  );

  return { issues, setIssues, handleSaveError };
}
