import { useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useWebSocket } from "@/client/src/contexts/useWebSocket.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { useDirtyFormsStore } from "@/client/src/stores/dirtyFormsStore.ts";

const EVENT_INVALIDATION_MAP: Record<string, readonly (readonly string[])[]> = {
  "activities:updated": [queryKeys.activities.all, queryKeys.dashboard.stats],
  "notifications:updated": [queryKeys.notifications.all, queryKeys.activities.all, queryKeys.dashboard.stats],
};

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const buildVersionRef = useRef<string | null>(null);

  const onMessage = useCallback(
    (data: { type: string; [key: string]: unknown }) => {
      if (data.type === "app:version") {
        const version = data.version as string;
        if (buildVersionRef.current && buildVersionRef.current !== version) {
          snackbar.info("A new version is available", {
            action: {
              label: "Refresh",
              onClick: () => {
                // Warn before reload if any form has unsaved work — the
                // refresh would otherwise discard it without recourse.
                const dirty = useDirtyFormsStore.getState().count > 0;
                if (dirty && !window.confirm("You have unsaved changes that will be lost. Refresh anyway?")) {
                  return;
                }
                window.location.reload();
              },
            },
            persistent: true,
          });
        }
        buildVersionRef.current = version;
        return;
      }

      const keys = EVENT_INVALIDATION_MAP[data.type];
      if (!keys) return;
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, snackbar],
  );

  useWebSocket({ enabled: isAuthenticated, identity: userId, onMessage });

  return <>{children}</>;
}
