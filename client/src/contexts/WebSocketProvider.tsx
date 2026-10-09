import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useRef, useState } from "react";

import { ConfirmDialog } from "@/client/src/components/common/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { useDirtyFormsStore } from "@/client/src/stores/dirtyFormsStore.ts";

import { useSnackbar } from "./useSnackbar.ts";
import { useWebSocket, type WsMessage } from "./useWebSocket.ts";

interface WebSocketProviderProps {
  children: ReactNode;
}

const EVENT_INVALIDATION_MAP: Record<string, readonly (readonly string[])[]> = {
  "activities:updated": [QUERY_KEYS.activities.all, QUERY_KEYS.dashboard.stats],
  "notifications:updated": [QUERY_KEYS.notifications.all, QUERY_KEYS.activities.all, QUERY_KEYS.dashboard.stats],
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const buildVersionRef = useRef<string | null>(null);
  // A refresh would discard unsaved form work: confirm it first.
  const [confirmRefresh, setConfirmRefresh] = useState(false);

  const handleMessage = useCallback(
    (data: WsMessage) => {
      if (data.type === "app:version") {
        if (typeof data.version !== "string") return;
        const { version } = data;
        if (buildVersionRef.current && buildVersionRef.current !== version) {
          snackbar.info("A new version is available", {
            action: {
              label: "Refresh",
              onClick: () => {
                if (useDirtyFormsStore.getState().count > 0) setConfirmRefresh(true);
                else window.location.reload();
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
      for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient, snackbar],
  );

  useWebSocket({ enabled: isAuthenticated, identity: userId, onMessage: handleMessage });

  return (
    <>
      {children}
      <ConfirmDialog
        open={confirmRefresh}
        onClose={() => setConfirmRefresh(false)}
        onConfirm={() => window.location.reload()}
        pending={false}
        title="Refresh Arkyvree"
        message="Are you sure you want to refresh? Your unsaved changes will be lost."
        confirmLabel="Refresh"
        intent="caution"
      />
    </>
  );
}
