import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc, ApiError } from "@/client/src/services/rpc.ts";
import { useQueryClient } from "@tanstack/react-query";

export function useExportDownload() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const downloadExport = async (notificationId: string, exportId: string, fileName: string) => {
    // Mark notification as read (best-effort)
    try {
      await rpc.api.notifications[":id"].read.$post({ param: { id: notificationId } });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    } catch {
      // Don't block the download
    }

    if (!exportId) {
      snackbar.error("Download link is no longer available");
      return;
    }

    try {
      const response = await rpc.api.exports[":id"].download.$get({
        param: { id: exportId },
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      if (error instanceof ApiError && error.message.includes("expired")) {
        snackbar.warning("This export has expired. Please generate a new one.");
      } else {
        snackbar.error(error, "Failed to download export");
      }
    }
  };

  return { downloadExport };
}
