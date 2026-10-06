import { useMutation } from "@tanstack/react-query";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { ApiError } from "@/client/src/services/rpc.ts";

/** Queues a PDF export; the user is notified when it's ready. */
export function usePdfExport(requestPdf: () => Promise<unknown>) {
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: requestPdf,
    onSuccess: () => {
      snackbar.info("Generating your PDF: you'll be notified when it's ready");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        snackbar.warning("Too many PDF requests: wait a minute and try again");
      } else {
        snackbar.error(error, "Failed to start PDF generation");
      }
    },
  });
}
