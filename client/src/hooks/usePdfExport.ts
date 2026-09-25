import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { ApiError } from "@/client/src/services/rpc.ts";
import { useMutation } from "@tanstack/react-query";

/** Queues a PDF export; the user is notified when it's ready. */
export function usePdfExport(requestPdf: () => Promise<unknown>) {
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: requestPdf,
    onSuccess: () => {
      snackbar.info("Your PDF is being generated. You'll be notified when it's ready.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        snackbar.warning("Too many PDF requests. Please wait a minute before trying again.");
      } else {
        snackbar.error(error, "Failed to start PDF generation");
      }
    },
  });
}
