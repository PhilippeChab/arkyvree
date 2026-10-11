import { useMutation } from "@tanstack/react-query";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { rateLimited } from "@/client/src/lib/errorMessage.ts";

/** Queues a PDF export through `exportFn`, its request; the user is notified when it's ready. */
export function usePdfExport(exportFn: () => Promise<unknown>) {
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: exportFn,
    onSuccess: () => {
      snackbar.info("Generating your PDF: you'll be notified when it's ready");
    },
    onError: (error) => {
      if (rateLimited(error)) snackbar.warning("Too many PDF requests: try again in a minute");
      else snackbar.error(error, "Failed to start PDF generation");
    },
  });
}
